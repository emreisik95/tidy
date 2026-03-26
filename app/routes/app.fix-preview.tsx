import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import * as ai from "../services/ai.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const productGid = formData.get("productGid") as string;
  const issueType = formData.get("issueType") as string;

  if (!productGid || !issueType) {
    return json({ error: "productGid and issueType required" }, { status: 400 });
  }

  // Get shop language
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  const lang = shop?.language || "en";

  // Fetch current product data
  const productResponse = await admin.graphql(
    `
    query Product($id: ID!) {
      product(id: $id) {
        title
        description
        productType
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
    }
  `,
    { variables: { id: productGid } },
  );

  const productData = await productResponse.json();
  const product = productData.data?.product;

  if (!product) {
    return json({ error: "Product not found" }, { status: 404 });
  }

  const title = product.title;
  const description = product.description || "";
  const productType = product.productType || "";

  try {
    let preview: Record<string, any> = {};

    switch (issueType) {
      case "missing_description":
      case "short_description": {
        const generated = await ai.generateDescription(title, productType, description, lang);
        preview = { type: "description", value: generated };
        break;
      }
      case "missing_seo_title":
      case "missing_seo_description":
      case "short_seo_description": {
        const seo = await ai.generateSeo(title, description, productType, lang);
        preview = { type: "seo", value: seo };
        break;
      }
      case "missing_alt_text": {
        const images = product.media.edges
          .filter((e: any) => e.node.image && !e.node.alt?.trim())
          .slice(0, 3);
        const altTexts = await Promise.all(
          images.map(async (e: any) => ({
            imageUrl: e.node.image.url,
            altText: await ai.generateAltText(e.node.image.url, title, lang),
          })),
        );
        preview = { type: "alt_text", value: altTexts };
        break;
      }
      case "no_tags": {
        const tags = await ai.generateTags(title, description, productType, lang);
        preview = { type: "tags", value: tags };
        break;
      }
      case "missing_category": {
        const cat = await ai.suggestCategory(title, description, productType);
        preview = { type: "category", value: cat };
        break;
      }
      default:
        return json({ error: `Cannot preview fix for ${issueType}` }, { status: 400 });
    }

    return json({ preview });
  } catch (err: any) {
    console.error("AI preview error:", err.message);
    const isAuthError = err.status === 401 || err.message?.includes("API key");
    return json(
      {
        error: isAuthError
          ? "AI service is not configured. Please contact the app developer."
          : "Couldn't generate a fix right now. Try again in a moment.",
      },
      { status: 500 },
    );
  }
}
