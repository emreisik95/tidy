import { authenticate, PLANS } from "../shopify.server";
import prisma from "../db.server";

export type ActivePlan = "free" | "basic" | "ai";

export async function getActivePlan(request: Request): Promise<ActivePlan> {
  // In production, check Shopify Billing API
  if (process.env.NODE_ENV === "production") {
    try {
      const { billing } = await authenticate.admin(request);

      const hasAi = await billing.check({ plans: [PLANS.AI] });
      if (hasAi.appSubscriptions.length > 0) return "ai";

      const hasBasic = await billing.check({ plans: [PLANS.BASIC] });
      if (hasBasic.appSubscriptions.length > 0) return "basic";

      return "free";
    } catch {
      return "free";
    }
  }

  // In dev mode, billing API unavailable -- read from DB
  // but allow AI features for testing (fix-preview and fix routes check separately)
  try {
    const { session } = await authenticate.admin(request);
    const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
    return shop?.plan || "free";
  } catch {
    return "free";
  }
}
