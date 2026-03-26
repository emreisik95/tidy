import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import * as ai from "../services/ai.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const issueId = formData.get("issueId") as string;
  const productGid = formData.get("productGid") as string;
  const issueType = formData.get("issueType") as string;

  if (!issueId || !productGid) {
    return json({ error: "issueId and productGid are required" }, { status: 400 });
  }

  // Get shop language
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  const lang = shop?.language || "en";

  // Fetch current product data
  const productResponse = await admin.graphql(
    `query Product($id: ID!) {
      product(id: $id) {
        title
        description
        productType
        tags
        media(first: 20) {
          edges {
            node {
              ... on MediaImage {
                id
                alt
                image { url }
              }
            }
          }
        }
      }
    }`,
    { variables: { id: productGid } },
  );
  const productData = await productResponse.json();
  const product = productData.data?.product;

  if (!product) {
    return json({ error: "Product not found" }, { status: 404 });
  }

  try {
    const title = product.title;
    const description = product.description || "";
    const productType = product.productType || "";

    switch (issueType) {
      case "missing_description":
      case "short_description": {
        const generated = await ai.generateDescription(title, productType, description, lang);
        await admin.graphql(
          `mutation($input: ProductInput!) {
            productUpdate(input: $input) {
              product { id }
              userErrors { field message }
            }
          }`,
          { variables: { input: { id: productGid, descriptionHtml: `<p>${generated}</p>` } } },
        );
        break;
      }

      case "missing_seo_title":
      case "missing_seo_description":
      case "short_seo_description": {
        const generated = await ai.generateSeo(title, description, productType, lang);
        await admin.graphql(
          `mutation($input: ProductInput!) {
            productUpdate(input: $input) {
              product { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              input: {
                id: productGid,
                seo: {
                  title: generated.seoTitle,
                  description: generated.seoDescription,
                },
              },
            },
          },
        );
        // Mark ALL SEO issues as fixed (find IDs first, updateMany can't filter by relation)
        const seoIssues = await prisma.issue.findMany({
          where: {
            productScore: { productGid },
            type: { in: ["missing_seo_title", "missing_seo_description", "short_seo_description"] },
            fixedAt: null,
          },
          select: { id: true },
        });
        if (seoIssues.length > 0) {
          await prisma.issue.updateMany({
            where: { id: { in: seoIssues.map((i) => i.id) } },
            data: { fixedAt: new Date() },
          });
        }
        // Recalculate score and return
        await recalculateScore(productGid);
        return json({ success: true, issueId, issueType });
      }

      case "missing_alt_text": {
        const images = product.media.edges
          .filter((e: any) => e.node.image && !e.node.alt?.trim());
        const mediaUpdates = await Promise.all(
          images.map(async (e: any) => ({
            id: e.node.id,
            alt: await ai.generateAltText(e.node.image.url, title, lang),
          })),
        );
        if (mediaUpdates.length > 0) {
          await admin.graphql(
            `mutation($productId: ID!, $media: [UpdateMediaInput!]!) {
              productUpdateMedia(productId: $productId, media: $media) {
                media { id alt }
                userErrors { field message }
              }
            }`,
            { variables: { productId: productGid, media: mediaUpdates } },
          );
        }
        break;
      }

      case "missing_category": {
        const categoryGid = formData.get("categoryGid") as string;
        if (!categoryGid) {
          return json({ error: "No category selected" }, { status: 400 });
        }
        await admin.graphql(
          `mutation($input: ProductInput!) {
            productUpdate(input: $input) {
              product { id category { id fullName } }
              userErrors { field message }
            }
          }`,
          { variables: { input: { id: productGid, category: categoryGid } } },
        );
        break;
      }

      case "no_tags": {
        const tags = await ai.generateTags(title, description, productType, lang);
        await admin.graphql(
          `mutation($input: ProductInput!) {
            productUpdate(input: $input) {
              product { id }
              userErrors { field message }
            }
          }`,
          { variables: { input: { id: productGid, tags } } },
        );
        break;
      }

      default:
        return json({ error: `Cannot fix ${issueType}` }, { status: 400 });
    }

    // Mark issue as fixed
    await prisma.issue.update({
      where: { id: issueId },
      data: { fixedAt: new Date() },
    });

    // Recalculate product score based on remaining unfixed issues
    await recalculateScore(productGid);

    return json({ success: true, issueId, issueType });
  } catch (err: any) {
    console.error("Fix error:", err.message);
    return json(
      { error: "Couldn't apply the fix. Try again in a moment." },
      { status: 500 },
    );
  }
}

async function recalculateScore(productGid: string) {
  // Find the latest productScore for this product
  const productScore = await prisma.productScore.findFirst({
    where: { productGid },
    orderBy: { createdAt: "desc" },
    include: { issues: true },
  });

  if (!productScore) return;

  // Count weight of remaining unfixed issues
  const WEIGHTS: Record<string, number> = {
    missing_title: 10,
    missing_description: 15,
    no_images: 10,
    missing_alt_text: 15,
    missing_seo_title: 12,
    missing_seo_description: 12,
    missing_category: 8,
    missing_product_type: 5,
    no_tags: 5,
    missing_barcode: 5,
    missing_vendor: 3,
  };
  const MAX_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

  const unfixedWeight = productScore.issues
    .filter((i) => !i.fixedAt)
    .reduce((sum, i) => sum + (WEIGHTS[i.type] || 0), 0);

  const newScore = Math.round(((MAX_WEIGHT - unfixedWeight) / MAX_WEIGHT) * 100);

  await prisma.productScore.update({
    where: { id: productScore.id },
    data: { score: newScore },
  });

  // Also update the scan's overall score
  const allScores = await prisma.productScore.findMany({
    where: { scanId: productScore.scanId },
  });
  const avgScore = Math.round(
    allScores.reduce((sum, s) => sum + s.score, 0) / allScores.length,
  );
  await prisma.scan.update({
    where: { id: productScore.scanId },
    data: { overallScore: avgScore },
  });
}
