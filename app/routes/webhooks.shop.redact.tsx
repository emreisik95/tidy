import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  // Delete all data for this shop
  const shopRecord = await prisma.shop.findUnique({
    where: { domain: shop },
  });

  if (shopRecord) {
    // Cascade delete handles scans, productScores, and issues
    await prisma.shop.delete({ where: { id: shopRecord.id } });
    console.log(`Deleted all data for ${shop}`);
  }

  // Also clean up sessions
  await prisma.session.deleteMany({ where: { shop } });

  return new Response();
};
