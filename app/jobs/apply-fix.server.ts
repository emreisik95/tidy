import { Worker, type Job } from "bullmq";
import { connection } from "../lib/queue.server";

export interface ApplyFixPayload {
  issueId: string;
  productGid: string;
  shopDomain: string;
  accessToken: string;
  issueType: string;
  batchId?: string;
}

export function startFixWorker() {
  const worker = new Worker(
    "fix-application",
    async (job: Job<ApplyFixPayload>) => {
      const { issueId, productGid, shopDomain, accessToken, batchId } = job.data;

      // Check if batch was cancelled
      if (batchId) {
        const { default: prisma } = await import("../db.server");
        const batch = await prisma.fixBatch.findUnique({ where: { id: batchId } });
        if (batch?.status === "cancelled") {
          return { success: false, skipped: true };
        }
      }

      const { fixIssueWithToken } = await import("../services/fixer.server");
      return fixIssueWithToken(shopDomain, accessToken, issueId, productGid);
    },
    {
      connection,
      concurrency: 3,
      limiter: { max: 10, duration: 1000 },
    },
  );

  worker.on("completed", async (job) => {
    console.log(`Fix job ${job.id} completed for issue ${job.data.issueId}`);
    if (job.data.batchId) {
      const { default: prisma } = await import("../db.server");
      const isSkipped = job.returnvalue?.skipped;
      const batch = await prisma.fixBatch.update({
        where: { id: job.data.batchId },
        data: { [isSkipped ? "failedIssues" : "completedIssues"]: { increment: 1 } },
      });
      if (batch.completedIssues + batch.failedIssues >= batch.totalIssues) {
        await prisma.fixBatch.update({
          where: { id: job.data.batchId },
          data: { status: batch.status === "cancelled" ? "cancelled" : "completed" },
        });
      }
    }
  });

  worker.on("failed", async (job, err) => {
    console.error(`Fix job ${job?.id} failed:`, err.message);
    if (job?.data.batchId) {
      const { default: prisma } = await import("../db.server");

      // Append error to batch log
      const errorEntry = `${job.data.issueType} (${job.data.productGid.split("/").pop()}): ${err.message.slice(0, 100)}`;
      const existing = await prisma.fixBatch.findUnique({ where: { id: job.data.batchId } });
      const currentLog = existing?.errorLog || "";
      const newLog = currentLog ? `${currentLog}\n${errorEntry}` : errorEntry;

      const batch = await prisma.fixBatch.update({
        where: { id: job.data.batchId },
        data: {
          failedIssues: { increment: 1 },
          errorLog: newLog.slice(0, 5000), // Cap at 5KB
        },
      });
      if (batch.completedIssues + batch.failedIssues >= batch.totalIssues) {
        await prisma.fixBatch.update({
          where: { id: job.data.batchId },
          data: { status: batch.status === "cancelled" ? "cancelled" : "completed" },
        });
      }
    }
  });

  return worker;
}
