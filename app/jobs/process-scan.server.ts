import { Worker, type Job } from "bullmq";
import { connection } from "../lib/queue.server";
import prisma from "../db.server";
import { scoreProduct } from "../services/scoring.server";
import { parseJsonl } from "../services/scanner.server";

export interface ProcessScanPayload {
  scanId: string;
  jsonlUrl: string;
  shopDomain: string;
}

async function processScan(job: Job<ProcessScanPayload>) {
  const { scanId, jsonlUrl } = job.data;

  await job.updateProgress(0);

  const response = await fetch(jsonlUrl);
  if (!response.ok) {
    throw new Error(`Failed to download JSONL: ${response.status}`);
  }
  const text = await response.text();
  const products = parseJsonl(text);

  await job.updateProgress(20);

  let totalScore = 0;

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const result = scoreProduct(product);
      totalScore += result.score;

      const productScore = await tx.productScore.create({
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
            productScoreId: productScore.id,
            type: issue.type as any,
            severity: issue.severity as any,
            field: issue.field,
            message: issue.message,
            aiFixable: issue.aiFixable,
          })),
        });
      }

      await job.updateProgress(
        20 + Math.round((i / products.length) * 70),
      );
    }

    const overallScore =
      products.length > 0
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

    const scan = await tx.scan.findUniqueOrThrow({
      where: { id: scanId },
    });
    await tx.shop.update({
      where: { id: scan.shopId },
      data: { lastScanAt: new Date() },
    });
  });

  await job.updateProgress(100);
  return {
    productsProcessed: products.length,
    overallScore: totalScore / products.length,
  };
}

export function startScanWorker() {
  const worker = new Worker("scan-processing", processScan, {
    connection,
    concurrency: 2,
  });

  worker.on("completed", (job) => {
    console.log(`Scan job ${job.id} completed:`, job.returnvalue);
  });

  worker.on("failed", (job, err) => {
    console.error(`Scan job ${job?.id} failed:`, err.message);
    if (job?.data.scanId) {
      prisma.scan
        .update({
          where: { id: job.data.scanId },
          data: { status: "failed" },
        })
        .catch(console.error);
    }
  });

  return worker;
}
