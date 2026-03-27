import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";
import { rescanProduct } from "../services/rescan.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const productGid = (payload as any).admin_graphql_api_id as string;

  console.log(`Received PRODUCTS_UPDATE webhook for ${shop} - ${productGid}`);

  // Fire-and-forget: rescan this product in DB
  const { admin } = await unauthenticated.admin(shop);
  rescanProduct(admin, productGid).catch((err) =>
    console.error(`Auto-rescan failed for ${productGid}:`, err.message),
  );

  return new Response();
};
