import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";
import { handleBulkOperationComplete } from "../services/scanner.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  console.log(`Received bulk_operations/finish webhook for ${shop}`);

  const { admin_graphql_api_id } = payload as {
    admin_graphql_api_id: string;
  };

  // Get admin API context for this shop (webhook doesn't provide one)
  const { admin } = await unauthenticated.admin(shop);

  await handleBulkOperationComplete(admin_graphql_api_id, shop, admin);

  return new Response();
};
