import prisma from "../db.server";
import { scoreProduct } from "./scoring.server";

export async function rescanProduct(admin: any, productGid: string) {
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

  const result = scoreProduct(scannedProduct);

  const existing = await prisma.productScore.findFirst({
    where: { productGid },
    orderBy: { createdAt: "desc" },
  });

  if (!existing) return;

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
