import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import * as ai from "../services/ai.server";

function applyAltTextTemplate(template: string, product: any, variantTitle?: string): string {
  return template
    .replace(/\{title\}/g, product.title || "")
    .replace(/\{vendor\}/g, product.vendor || "")
    .replace(/\{product_type\}/g, product.productType || "")
    .replace(/\{tags\}/g, (product.tags || []).join(", "))
    .replace(/\{variant_title\}/g, variantTitle || "")
    .trim();
}

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
  const shopRecord = await prisma.shop.findUnique({ where: { domain: session.shop } });
  const lang = shopRecord?.language || "en";
  const altTextTemplate = shopRecord?.altTextTemplate;

  // Fetch current product data
  const productResponse = await admin.graphql(
    `query Product($id: ID!) {
      product(id: $id) {
        title
        description
        productType
        vendor
        tags
        seo { title description }
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
        // Mark ALL SEO issues in the same scan as fixed
        const thisIssue = await prisma.issue.findUnique({
          where: { id: issueId },
          select: { productScoreId: true },
        });
        if (thisIssue) {
          await prisma.issue.updateMany({
            where: {
              productScoreId: thisIssue.productScoreId,
              type: { in: ["missing_seo_title", "missing_seo_description", "short_seo_description"] },
              fixedAt: null,
            },
            data: { fixedAt: new Date() },
          });
        }
        // Rescan product and return
        await rescanProduct(admin, productGid);
        return json({ success: true, issueId, issueType });
      }

      case "missing_alt_text": {
        const images = product.media.edges
          .filter((e: any) => e.node.image && !e.node.alt?.trim());
        let mediaUpdates: { id: string; alt: string }[];
        if (altTextTemplate) {
          mediaUpdates = images.map((e: any) => ({
            id: e.node.id,
            alt: applyAltTextTemplate(altTextTemplate, { title, productType, vendor: product.vendor, tags: product.tags }),
          }));
        } else {
          mediaUpdates = await Promise.all(
            images.map(async (e: any) => ({
              id: e.node.id,
              alt: await ai.generateAltText(e.node.image.url, title, lang),
            })),
          );
        }
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
        let categoryGid = formData.get("categoryGid") as string;

        // If no category provided (e.g. from Fix All), auto-select best match
        if (!categoryGid) {
          const suggestedName = await ai.suggestCategoryName(title, description, productType);
          const segments = suggestedName.split(">").map((s: string) => s.trim());
          const searchQueries = [
            segments.slice(-2).join(" "),
            segments.slice(-1).join(" "),
            productType || title,
          ].filter(Boolean);

          let bestMatch: { id: string; isLeaf: boolean } | null = null;

          for (const query of searchQueries) {
            const taxResponse = await admin.graphql(
              `query TaxSearch($query: String!) {
                taxonomy { categories(first: 5, search: $query) { nodes { id isLeaf } } }
              }`,
              { variables: { query } },
            );
            const taxData = await taxResponse.json();
            const nodes = taxData.data?.taxonomy?.categories?.nodes || [];

            // Prefer leaf categories (most specific)
            const leaf = nodes.find((n: any) => n.isLeaf);
            if (leaf) { bestMatch = leaf; break; }
            if (!bestMatch && nodes.length > 0) bestMatch = nodes[0];
          }

          if (!bestMatch) {
            // Can't find a category -- skip silently
            break;
          }
          categoryGid = bestMatch.id;
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

    // Re-scan this single product to get fresh score
    await rescanProduct(admin, productGid);

    // Increment fix counter
    if (shopRecord) {
      await prisma.shop.update({
        where: { id: shopRecord.id },
        data: { totalFixes: { increment: 1 } },
      });
    }

    return json({ success: true, issueId, issueType });
  } catch (err: any) {
    console.error("Fix error:", err.message);
    return json(
      { error: "Couldn't apply the fix. Try again in a moment." },
      { status: 500 },
    );
  }
}

async function rescanProduct(admin: any, productGid: string) {
  const { scoreProduct } = await import("../services/scoring.server");

  // Fetch fresh product data from Shopify
  const response = await admin.graphql(
    `query Product($id: ID!) {
      product(id: $id) {
        id
        title
        description
        descriptionHtml
        productType
        vendor
        tags
        category { id }
        seo { title description }
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
        variants(first: 100) {
          edges {
            node {
              id
              barcode
            }
          }
        }
      }
    }`,
    { variables: { id: productGid } },
  );
  const data = await response.json();
  const p = data.data?.product;
  if (!p) return;

  // Build ScannedProduct shape
  const scannedProduct = {
    id: p.id,
    title: p.title || "",
    description: p.description || "",
    descriptionHtml: p.descriptionHtml || "",
    images: (p.media?.edges || [])
      .filter((e: any) => e.node.image)
      .map((e: any) => ({
        id: e.node.id,
        altText: e.node.alt || null,
        url: e.node.image.url,
      })),
    seo: {
      title: p.seo?.title || null,
      description: p.seo?.description || null,
    },
    category: p.category?.id || null,
    productType: p.productType || "",
    tags: p.tags || [],
    vendor: p.vendor || "",
    variants: (p.variants?.edges || []).map((e: any) => ({
      id: e.node.id,
      barcode: e.node.barcode || null,
    })),
  };

  // Score it fresh
  const result = scoreProduct(scannedProduct);

  // Find existing productScore for this product
  const existing = await prisma.productScore.findFirst({
    where: { productGid },
    orderBy: { createdAt: "desc" },
  });

  if (!existing) return;

  // Delete old issues, create new ones, update score
  await prisma.$transaction(async (tx) => {
    await tx.issue.deleteMany({ where: { productScoreId: existing.id } });

    if (result.issues.length > 0) {
      await tx.issue.createMany({
        data: result.issues.map((issue) => ({
          productScoreId: existing.id,
          type: issue.type as any,
          severity: issue.severity as any,
          field: issue.field,
          message: issue.message,
          aiFixable: issue.aiFixable,
        })),
      });
    }

    await tx.productScore.update({
      where: { id: existing.id },
      data: {
        score: result.score,
        imageCount: scannedProduct.images.length,
      },
    });

    // Update scan overall score
    const allScores = await tx.productScore.findMany({
      where: { scanId: existing.scanId },
    });
    const avgScore = Math.round(
      allScores.reduce((sum, s) => sum + s.score, 0) / allScores.length,
    );
    await tx.scan.update({
      where: { id: existing.scanId },
      data: { overallScore: avgScore },
    });
  });
}
