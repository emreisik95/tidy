import prisma from "../db.server";
import * as ai from "./ai.server";

const PRODUCT_UPDATE_MUTATION = `
  mutation ProductUpdate($input: ProductInput!) {
    productUpdate(input: $input) {
      product { id }
      userErrors { field message }
    }
  }
`;

const PRODUCT_UPDATE_MEDIA_MUTATION = `
  mutation ProductUpdateMedia($productId: ID!, $media: [UpdateMediaInput!]!) {
    productUpdateMedia(productId: $productId, media: $media) {
      media { id alt }
      userErrors { field message }
    }
  }
`;

async function shopifyGraphql(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables: Record<string, any>,
  maxRetries = 3,
): Promise<any> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(
      `https://${shopDomain}/admin/api/2026-04/graphql.json`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": accessToken,
        },
        body: JSON.stringify({ query, variables }),
      },
    );

    // Rate limited -- wait and retry
    if (response.status === 429) {
      const retryAfter = parseFloat(response.headers.get("Retry-After") || "2");
      console.warn(`Shopify rate limited, retrying in ${retryAfter}s`);
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Shopify API error: ${response.status}`);
    }

    const data = await response.json();

    // Check for throttled response in GraphQL extensions
    const cost = data.extensions?.cost;
    if (cost?.throttleStatus?.currentlyAvailable < 50) {
      // Running low on budget, pause briefly
      await new Promise((r) => setTimeout(r, 1000));
    }

    return data;
  }
  throw new Error("Shopify API: max retries exceeded");
}

async function fetchProductData(
  shopDomain: string,
  accessToken: string,
  productGid: string,
) {
  const data = await shopifyGraphql(shopDomain, accessToken, `
    query Product($id: ID!) {
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
    }
  `, { id: productGid });

  const product = data.data.product;
  return {
    title: product.title,
    description: product.description || "",
    productType: product.productType || "",
    tags: product.tags || [],
    images: product.media.edges
      .filter((e: any) => e.node.image)
      .map((e: any) => ({
        id: e.node.id,
        altText: e.node.alt,
        url: e.node.image.url,
      })),
  };
}

export async function fixIssueWithToken(
  shopDomain: string,
  accessToken: string,
  issueId: string,
  productGid: string,
) {
  const issue = await prisma.issue.findUniqueOrThrow({
    where: { id: issueId },
  });

  if (issue.fixedAt) {
    return { success: true, alreadyFixed: true };
  }

  const productData = await fetchProductData(
    shopDomain,
    accessToken,
    productGid,
  );

  let query: string;
  let variables: Record<string, any>;

  switch (issue.type) {
    case "missing_description":
    case "short_description": {
      const description = await ai.generateDescription(
        productData.title,
        productData.productType,
        productData.description,
      );
      query = PRODUCT_UPDATE_MUTATION;
      variables = {
        input: {
          id: productGid,
          descriptionHtml: `<p>${description}</p>`,
        },
      };
      break;
    }

    case "missing_seo_title":
    case "missing_seo_description":
    case "short_seo_description": {
      const seo = await ai.generateSeo(
        productData.title,
        productData.description,
        productData.productType,
      );
      query = PRODUCT_UPDATE_MUTATION;
      variables = { input: { id: productGid, seo } };
      break;
    }

    case "missing_alt_text": {
      const imagesToFix = productData.images.filter(
        (img: any) => !img.altText?.trim(),
      );
      const mediaUpdates = await Promise.all(
        imagesToFix.map(async (img: any) => ({
          id: img.id,
          alt: await ai.generateAltText(img.url, productData.title),
        })),
      );
      query = PRODUCT_UPDATE_MEDIA_MUTATION;
      variables = { productId: productGid, media: mediaUpdates };
      break;
    }

    case "no_tags": {
      const tags = await ai.generateTags(
        productData.title,
        productData.description,
        productData.productType,
      );
      query = PRODUCT_UPDATE_MUTATION;
      variables = { input: { id: productGid, tags } };
      break;
    }

    default:
      throw new Error(`Issue type ${issue.type} is not AI-fixable`);
  }

  const data = await shopifyGraphql(
    shopDomain,
    accessToken,
    query,
    variables,
  );

  const errors =
    data.data?.productUpdate?.userErrors ||
    data.data?.productUpdateMedia?.userErrors ||
    [];
  if (errors.length > 0) {
    throw new Error(errors.map((e: any) => e.message).join(", "));
  }

  await prisma.issue.update({
    where: { id: issueId },
    data: { fixedAt: new Date() },
  });

  return { success: true };
}
