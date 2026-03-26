import { authenticate, PLANS } from "../shopify.server";

export type ActivePlan = "free" | "basic" | "ai";

export async function getActivePlan(request: Request): Promise<ActivePlan> {
  // In dev mode, billing API is not available (requires public distribution)
  // Default to "ai" plan so all features are testable
  if (process.env.NODE_ENV !== "production") {
    return "ai";
  }

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
