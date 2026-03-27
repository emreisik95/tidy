import { Banner } from "@shopify/polaris";

interface UpsellBannerProps {
  issueCount: number;
  plan: string;
}

export function UpsellBanner({ issueCount, plan }: UpsellBannerProps) {
  if (plan === "ai" || issueCount === 0) return null;

  return (
    <Banner
      tone="info"
      title={`${issueCount} issues found that AI can fix`}
      action={{
        content: plan === "free" ? "Upgrade to AI plan" : "Upgrade",
        url: "/app/settings",
      }}
    >
      <p>
        {plan === "free"
          ? "Upgrade to the AI plan ($9.99/mo) to auto-fix descriptions, SEO, alt text, and more."
          : "Upgrade to the AI plan to fix issues with one click."}
      </p>
    </Banner>
  );
}
