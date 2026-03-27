import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";
import { handleBulkOperationComplete } from "../services/scanner.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);

  console.log(`Received bulk_operations/finish webhook for ${shop}`);

  const { admin_graphql_api_id } = payload as {
    admin_graphql_api_id: string;
  };

  // Respond immediately to Shopify (5s timeout requirement)
  // Process asynchronously after response
  const { admin } = await unauthenticated.admin(shop);

  // Fire-and-forget: don't await, let it process in background
  handleBulkOperationComplete(admin_graphql_api_id, shop, admin).catch(
    (err) => console.error("Bulk operation processing failed:", err.message),
  );

  return new Response();
};
