import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { startScan, getScanStatus } from "~/services/scanner.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const scanId = await startScan(admin, session.shop);
  return json({ scanId, status: "running" });
}

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const scanId = url.searchParams.get("scanId");

  if (!scanId) {
    return json({ error: "scanId required" }, { status: 400 });
  }

  const scan = await getScanStatus(scanId);
  return json({ scan });
}
