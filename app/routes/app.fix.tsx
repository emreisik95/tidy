import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { fixQueue } from "~/lib/queue.server";

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const issueId = formData.get("issueId") as string;
  const productGid = formData.get("productGid") as string;
  const issueType = formData.get("issueType") as string;

  if (!issueId || !productGid) {
    return json({ error: "issueId and productGid are required" }, { status: 400 });
  }

  const job = await fixQueue.add(
    "apply-fix",
    {
      issueId,
      productGid,
      shopDomain: session.shop,
      accessToken: session.accessToken!,
      issueType,
    },
    { jobId: `fix-${issueId}` },
  );

  return json({ jobId: job.id, status: "queued" });
}
