import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

async function undoSingleFix(admin: any, history: any) {
  if (history.field === "description" && history.oldValue !== null) {
    await admin.graphql(
      `mutation($input: ProductInput!) {
        productUpdate(input: $input) { product { id } userErrors { field message } }
      }`,
      { variables: { input: { id: history.productGid, descriptionHtml: history.oldValue ? `<p>${history.oldValue}</p>` : "" } } },
    );
  } else if (history.field === "seo" && history.oldValue) {
    const old = JSON.parse(history.oldValue);
    await admin.graphql(
      `mutation($input: ProductInput!) {
        productUpdate(input: $input) { product { id } userErrors { field message } }
      }`,
      { variables: { input: { id: history.productGid, seo: { title: old.title || "", description: old.description || "" } } } },
    );
  } else if (history.field.startsWith("alt_text:") && history.oldValue !== undefined) {
    const mediaId = history.field.replace("alt_text:", "");
    await admin.graphql(
      `mutation($productId: ID!, $media: [UpdateMediaInput!]!) {
        productUpdateMedia(productId: $productId, media: $media) { media { id } userErrors { field message } }
      }`,
      { variables: { productId: history.productGid, media: [{ id: mediaId, alt: history.oldValue || "" }] } },
    );
  } else if (history.field === "tags" && history.oldValue) {
    const oldTags = JSON.parse(history.oldValue);
    await admin.graphql(
      `mutation($input: ProductInput!) {
        productUpdate(input: $input) { product { id } userErrors { field message } }
      }`,
      { variables: { input: { id: history.productGid, tags: oldTags } } },
    );
  } else if (history.field === "productType" && history.oldValue !== undefined) {
    await admin.graphql(
      `mutation($input: ProductInput!) {
        productUpdate(input: $input) { product { id } userErrors { field message } }
      }`,
      { variables: { input: { id: history.productGid, productType: history.oldValue || "" } } },
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const batchId = formData.get("batchId") as string;

  if (batchId) {
    const records = await prisma.fixHistory.findMany({
      where: { batchId, shopDomain: session.shop, rolledBack: false },
    });

    for (const record of records) {
      await undoSingleFix(admin, record);
    }

    await prisma.fixHistory.updateMany({
      where: { batchId, shopDomain: session.shop },
      data: { rolledBack: true },
    });

    return json({ success: true, undoneCount: records.length });
  }

  const historyId = formData.get("historyId") as string;

  if (!historyId) {
    return json({ error: "historyId required" }, { status: 400 });
  }

  const history = await prisma.fixHistory.findUnique({ where: { id: historyId } });
  if (!history || history.shopDomain !== session.shop) {
    return json({ error: "Not found" }, { status: 404 });
  }

  if (history.rolledBack) {
    return json({ error: "Already rolled back" }, { status: 400 });
  }

  try {
    await undoSingleFix(admin, history);

    await prisma.fixHistory.update({
      where: { id: historyId },
      data: { rolledBack: true },
    });

    return json({ success: true });
  } catch (err: any) {
    console.error("Undo error:", err.message);
    return json({ error: "Couldn't undo. Try again." }, { status: 500 });
  }
}
