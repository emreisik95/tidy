import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const productGid = (payload as any).admin_graphql_api_id as string;

  console.log(`Received PRODUCTS_CREATE webhook for ${shop} - ${productGid}`);
  // New products will be picked up on next scan.
  // Auto-scanning requires a productScore to exist first.

  return new Response();
};
