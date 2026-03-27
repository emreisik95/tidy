import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { fixQueue } from "../lib/queue.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const batchId = url.searchParams.get("id");

  if (!batchId) {
    return json({ error: "id required" }, { status: 400 });
  }

  const batch = await prisma.fixBatch.findUnique({ where: { id: batchId } });
  if (!batch) {
    return json({ error: "Not found" }, { status: 404 });
  }

  return json({
    batch: {
      id: batch.id,
      status: batch.status,
      totalIssues: batch.totalIssues,
      completedIssues: batch.completedIssues,
      failedIssues: batch.failedIssues,
      errorLog: batch.errorLog,
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action") as string;

  if (actionType === "cancel") {
    const batchId = formData.get("batchId") as string;
    await prisma.fixBatch.update({
      where: { id: batchId },
      data: { status: "cancelled" },
    });
    return json({ success: true });
  }

  // action === "create"
  const issuesJson = formData.get("issues") as string;
  const issues = JSON.parse(issuesJson) as Array<{
    issueId: string;
    productGid: string;
    issueType: string;
  }>;

  // Get offline access token
  const sessionRecord = await prisma.session.findFirst({
    where: { shop: session.shop, isOnline: false },
  });

  if (!sessionRecord?.accessToken) {
    return json({ error: "No access token found" }, { status: 500 });
  }

  // Create batch
  const batch = await prisma.fixBatch.create({
    data: {
      shopDomain: session.shop,
      status: "running",
      totalIssues: issues.length,
    },
  });

  // Enqueue all issues to BullMQ
  for (const issue of issues) {
    await fixQueue.add(
      "apply-fix",
      {
        issueId: issue.issueId,
        productGid: issue.productGid,
        shopDomain: session.shop,
        accessToken: sessionRecord.accessToken,
        issueType: issue.issueType,
        batchId: batch.id,
      },
      { jobId: `batch-${batch.id}-${issue.issueId}` },
    );
  }

  return json({ batchId: batch.id });
}
