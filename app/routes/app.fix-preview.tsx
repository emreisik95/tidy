import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import * as ai from "../services/ai.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const productGid = formData.get("productGid") as string;
  const issueType = formData.get("issueType") as string;

  if (!productGid || !issueType) {
    return json({ error: "productGid and issueType required" }, { status: 400 });
  }

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
        const generated = await ai.generateDescription(title, productType, description);
        preview = { type: "description", value: generated };
        break;
      }
      case "missing_seo_title":
      case "missing_seo_description":
      case "short_seo_description": {
        const seo = await ai.generateSeo(title, description, productType);
        preview = { type: "seo", value: seo };
        break;
      }
      case "missing_alt_text": {
        const images = product.media.edges
          .filter((e: any) => e.node.image && !e.node.alt?.trim())
          .slice(0, 3); // Preview max 3
        const altTexts = await Promise.all(
          images.map(async (e: any) => ({
            imageUrl: e.node.image.url,
            altText: await ai.generateAltText(e.node.image.url, title),
          })),
        );
        preview = { type: "alt_text", value: altTexts };
        break;
      }
      case "no_tags": {
        const tags = await ai.generateTags(title, description, productType);
        preview = { type: "tags", value: tags };
        break;
      }
      default:
        return json({ error: `Cannot preview fix for ${issueType}` }, { status: 400 });
    }

    return json({ preview });
  } catch (err: any) {
    return json({ error: err.message || "AI generation failed" }, { status: 500 });
  }
}
