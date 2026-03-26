import { Worker, type Job } from "bullmq";
import { connection } from "~/lib/queue.server";

export interface ApplyFixPayload {
  issueId: string;
  productGid: string;
  shopDomain: string;
  accessToken: string;
  issueType: string;
}

export function startFixWorker() {
  const worker = new Worker(
    "fix-application",
    async (job: Job<ApplyFixPayload>) => {
      const { issueId, productGid, shopDomain, accessToken } = job.data;

      const { fixIssueWithToken } = await import(
        "~/services/fixer.server"
      );
      return fixIssueWithToken(shopDomain, accessToken, issueId, productGid);
    },
    {
      connection,
      concurrency: 3,
      limiter: {
        max: 10,
        duration: 1000,
      },
    },
  );

  worker.on("completed", (job) => {
    console.log(
      `Fix job ${job.id} completed for issue ${job.data.issueId}`,
    );
  });

  worker.on("failed", (job, err) => {
    console.error(`Fix job ${job?.id} failed:`, err.message);
  });

  return worker;
}
