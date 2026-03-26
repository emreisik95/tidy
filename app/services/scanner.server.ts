import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "~/db.server";
import type { ScannedProduct } from "~/lib/types";

const PRODUCTS_BULK_QUERY = `
{
  products {
    edges {
      node {
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
    }
  }
}
`;

export async function startScan(
  admin: AdminApiContext,
  shopDomain: string,
): Promise<string> {
  const shop = await prisma.shop.upsert({
    where: { domain: shopDomain },
    update: {},
    create: { domain: shopDomain },
  });

  const scan = await prisma.scan.create({
    data: { shopId: shop.id, status: "pending" },
  });

  const response = await admin.graphql(
    `
    mutation BulkQuery($query: String!) {
      bulkOperationRunQuery(query: $query) {
        bulkOperation { id status }
        userErrors { field message }
      }
    }
  `,
    { variables: { query: PRODUCTS_BULK_QUERY } },
  );

  const data = await response.json();
  const bulkOp = data.data.bulkOperationRunQuery;

  if (bulkOp.userErrors.length > 0) {
    await prisma.scan.update({
      where: { id: scan.id },
      data: { status: "failed" },
    });
    throw new Error(
      bulkOp.userErrors.map((e: any) => e.message).join(", "),
    );
  }

  await prisma.scan.update({
    where: { id: scan.id },
    data: {
      status: "running",
      bulkOperationId: bulkOp.bulkOperation.id,
    },
  });

  return scan.id;
}

export async function getScanStatus(scanId: string) {
  return prisma.scan.findUniqueOrThrow({ where: { id: scanId } });
}

export async function handleBulkOperationComplete(
  bulkOperationId: string,
  jsonlUrl: string | null,
  status: string,
  shopDomain: string,
) {
  const scan = await prisma.scan.findFirst({
    where: { bulkOperationId },
  });

  if (!scan) {
    console.warn(`No scan found for bulk operation ${bulkOperationId}`);
    return;
  }

  if (status === "COMPLETED" && jsonlUrl) {
    const { scanQueue } = await import("~/lib/queue.server");
    await scanQueue.add(
      "process-scan",
      { scanId: scan.id, jsonlUrl, shopDomain },
      { jobId: `scan-${scan.id}` },
    );
  } else {
    await prisma.scan.update({
      where: { id: scan.id },
      data: { status: "failed" },
    });
  }
}

export function parseJsonl(text: string): ScannedProduct[] {
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length === 0) return [];

  const productMap = new Map<string, any>();
  const childRecords: Array<{ record: any; parentId: string }> = [];

  for (const line of lines) {
    const record = JSON.parse(line);
    if (record.__parentId) {
      childRecords.push({ record, parentId: record.__parentId });
    } else {
      productMap.set(record.id, { ...record, _media: [], _variants: [] });
    }
  }

  for (const { record, parentId } of childRecords) {
    const parent = productMap.get(parentId);
    if (!parent) continue;

    if (record.id?.includes("MediaImage")) {
      parent._media.push(record);
    } else if (record.id?.includes("ProductVariant")) {
      parent._variants.push(record);
    }
  }

  return Array.from(productMap.values()).map(
    (raw): ScannedProduct => ({
      id: raw.id,
      title: raw.title || "",
      description: raw.description || "",
      descriptionHtml: raw.descriptionHtml || "",
      images: (raw._media || []).map((m: any) => ({
        id: m.id,
        altText: m.alt || null,
        url: m.image?.url || "",
      })),
      seo: {
        title: raw.seo?.title || null,
        description: raw.seo?.description || null,
      },
      category: raw.category?.id || null,
      productType: raw.productType || "",
      tags: raw.tags || [],
      vendor: raw.vendor || "",
      variants: (raw._variants || []).map((v: any) => ({
        id: v.id,
        barcode: v.barcode || null,
      })),
    }),
  );
}
