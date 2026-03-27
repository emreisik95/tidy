import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "../db.server";
import { scanQueue } from "../lib/queue.server";
import { scoreProduct } from "./scoring.server";
import type { ScannedProduct } from "../lib/types";

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

  // Delete old scans (keep only the latest)
  const oldScans = await prisma.scan.findMany({
    where: { shopId: shop.id },
    select: { id: true },
  });
  if (oldScans.length > 0) {
    await prisma.scan.deleteMany({
      where: { id: { in: oldScans.map((s) => s.id) } },
    });
  }

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
  bulkOperationGid: string,
  shopDomain: string,
  admin: AdminApiContext,
) {
  // Look up the scan by bulkOperationId
  const scan = await prisma.scan.findFirst({
    where: { bulkOperationId: bulkOperationGid },
  });

  if (!scan) {
    console.warn(`No scan found for bulk operation ${bulkOperationGid}`);
    return;
  }

  // Idempotency: skip if already completed or failed
  if (scan.status === "completed" || scan.status === "failed") {
    console.log(`Scan ${scan.id} already ${scan.status}, skipping duplicate webhook`);
    return;
  }

  // Query Shopify for the actual result URL (webhook doesn't include it)
  const response = await admin.graphql(
    `
    query BulkOpResult($id: ID!) {
      node(id: $id) {
        ... on BulkOperation {
          id
          status
          url
          errorCode
        }
      }
    }
  `,
    { variables: { id: bulkOperationGid } },
  );
  const data = await response.json();
  const bulkOp = data.data?.node;

  if (!bulkOp || bulkOp.status !== "COMPLETED" || !bulkOp.url) {
    console.error(`Bulk operation not completed or no URL: ${bulkOp?.status}`);
    await prisma.scan.update({
      where: { id: scan.id },
      data: { status: "failed" },
    });
    return;
  }

  // Try enqueue to BullMQ, fallback to inline processing
  try {
    await scanQueue.add(
      "process-scan",
      { scanId: scan.id, jsonlUrl: bulkOp.url, shopDomain },
      { jobId: `scan-${scan.id}` },
    );
    console.log(`Enqueued scan job for ${scan.id}`);
  } catch (err) {
    console.warn("BullMQ unavailable, processing inline:", err);
    await processInline(scan.id, bulkOp.url);
  }
}

async function processInline(scanId: string, jsonlUrl: string) {
  const res = await fetch(jsonlUrl);
  if (!res.ok) throw new Error(`Failed to download JSONL: ${res.status}`);
  const text = await res.text();
  let products = parseJsonl(text);

  // Free plan: limit to first 10 products
  const scanRecord = await prisma.scan.findUniqueOrThrow({
    where: { id: scanId },
    include: { shop: true },
  });
  if (scanRecord.shop.plan === "free") {
    products = products.slice(0, 10);
  }

  let totalScore = 0;

  await prisma.$transaction(async (tx) => {
    for (const product of products) {
      const result = scoreProduct(product);
      totalScore += result.score;

      const ps = await tx.productScore.create({
        data: {
          scanId,
          productGid: product.id,
          productTitle: product.title || "(untitled)",
          score: result.score,
          maxScore: result.maxScore,
          imageCount: product.images.length,
        },
      });

      if (result.issues.length > 0) {
        await tx.issue.createMany({
          data: result.issues.map((issue) => ({
            productScoreId: ps.id,
            type: issue.type as any,
            severity: issue.severity as any,
            field: issue.field,
            message: issue.message,
            aiFixable: issue.aiFixable,
          })),
        });
      }
    }

    const overallScore = products.length > 0
      ? Math.round(totalScore / products.length)
      : 0;

    await tx.scan.update({
      where: { id: scanId },
      data: {
        status: "completed",
        completedAt: new Date(),
        totalProducts: products.length,
        scannedProducts: products.length,
        overallScore,
      },
    });

    const overallScoreFinal = overallScore;
    const totalIssues = products.reduce((sum, p) => sum + scoreProduct(p).issues.length, 0);

    const scan = await tx.scan.findUniqueOrThrow({ where: { id: scanId } });
    await tx.shop.update({
      where: { id: scan.shopId },
      data: {
        lastScanAt: new Date(),
        totalScans: { increment: 1 },
      },
    });

    // Save scan snapshot for history/trends
    await tx.scanSnapshot.create({
      data: {
        shopId: scan.shopId,
        score: overallScoreFinal,
        products: products.length,
        issues: totalIssues,
      },
    });
  });

  console.log(`Scan ${scanId} completed: ${products.length} products, avg score ${Math.round(totalScore / products.length)}`);
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
