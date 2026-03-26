import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Badge,
  Divider,
  Icon,
  Select,
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { useState, useCallback } from "react";
import { authenticate, PLANS } from "../shopify.server";
import prisma from "../db.server";
import { getActivePlan, type ActivePlan } from "../services/billing.server";

const LANGUAGES = [
  { label: "English", value: "en" },
  { label: "Turkish (Türkçe)", value: "tr" },
  { label: "German (Deutsch)", value: "de" },
  { label: "French (Français)", value: "fr" },
  { label: "Spanish (Español)", value: "es" },
  { label: "Italian (Italiano)", value: "it" },
  { label: "Portuguese (Português)", value: "pt" },
  { label: "Dutch (Nederlands)", value: "nl" },
  { label: "Japanese (日本語)", value: "ja" },
  { label: "Korean (한국어)", value: "ko" },
  { label: "Chinese (中文)", value: "zh" },
  { label: "Arabic (العربية)", value: "ar" },
  { label: "Russian (Русский)", value: "ru" },
  { label: "Polish (Polski)", value: "pl" },
  { label: "Swedish (Svenska)", value: "sv" },
  { label: "Danish (Dansk)", value: "da" },
  { label: "Norwegian (Norsk)", value: "no" },
  { label: "Finnish (Suomi)", value: "fi" },
  { label: "Czech (Čeština)", value: "cs" },
  { label: "Romanian (Română)", value: "ro" },
  { label: "Hungarian (Magyar)", value: "hu" },
  { label: "Greek (Ελληνικά)", value: "el" },
  { label: "Thai (ไทย)", value: "th" },
  { label: "Vietnamese (Tiếng Việt)", value: "vi" },
  { label: "Indonesian (Bahasa)", value: "id" },
  { label: "Hindi (हिन्दी)", value: "hi" },
  { label: "Hebrew (עברית)", value: "he" },
  { label: "Ukrainian (Українська)", value: "uk" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const plan = await getActivePlan(request);

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  return json({
    plan,
    language: shop?.language || "en",
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { billing, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "language") {
    const language = formData.get("language") as string;
    await prisma.shop.upsert({
      where: { domain: session.shop },
      update: { language },
      create: { domain: session.shop, language },
    });
    return json({ success: true });
  }

  if (intent === "plan") {
    const targetPlan = formData.get("plan") as string;
    if (targetPlan === "basic" || targetPlan === "ai") {
      const planName = targetPlan === "ai" ? PLANS.AI : PLANS.BASIC;
      await billing.require({
        plans: [planName],
        isTest: true,
        onFailure: async () => redirect("/app/settings"),
      });
    }
  }

  return redirect("/app/settings");
}

const features: Record<string, { free: boolean; basic: boolean; ai: boolean }> = {
  "Product scanning": { free: true, basic: true, ai: true },
  "Completeness scoring": { free: true, basic: true, ai: true },
  "Issue identification": { free: true, basic: true, ai: true },
  "Up to 10 products": { free: true, basic: false, ai: false },
  "Unlimited products": { free: false, basic: true, ai: true },
  "AI-generated descriptions": { free: false, basic: false, ai: true },
  "AI-generated SEO metadata": { free: false, basic: false, ai: true },
  "AI-generated alt text": { free: false, basic: false, ai: true },
  "AI-generated tags": { free: false, basic: false, ai: true },
};

function PlanCard({
  name,
  price,
  planKey,
  currentPlan,
}: {
  name: string;
  price: string;
  planKey: ActivePlan;
  currentPlan: ActivePlan;
}) {
  const isCurrent = planKey === currentPlan;

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              {name}
            </Text>
            <Text as="p" variant="headingLg">
              {price}
            </Text>
          </BlockStack>
          {isCurrent && <Badge tone="success">Current plan</Badge>}
        </InlineStack>

        <Divider />

        <BlockStack gap="200">
          {Object.entries(features).map(([feature, plans]) => {
            const included = plans[planKey];
            return (
              <InlineStack key={feature} gap="200" blockAlign="center">
                {included ? (
                  <Icon source={CheckIcon} tone="success" />
                ) : (
                  <Text as="span" tone="subdued">
                    &mdash;
                  </Text>
                )}
                <Text
                  as="span"
                  variant="bodySm"
                  tone={included ? undefined : "subdued"}
                >
                  {feature}
                </Text>
              </InlineStack>
            );
          })}
        </BlockStack>

        {!isCurrent && planKey !== "free" && (
          <Form method="post">
            <input type="hidden" name="intent" value="plan" />
            <input type="hidden" name="plan" value={planKey} />
            <Button submit variant="primary" fullWidth>
              Upgrade to {name}
            </Button>
          </Form>
        )}
      </BlockStack>
    </Card>
  );
}

export default function Settings() {
  const { plan, language } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const [selectedLang, setSelectedLang] = useState(language);

  const handleLangChange = useCallback(
    (value: string) => {
      setSelectedLang(value);
      const formData = new FormData();
      formData.set("intent", "language");
      formData.set("language", value);
      submit(formData, { method: "post" });
    },
    [submit],
  );

  return (
    <Page title="Settings" backAction={{ url: "/app" }}>
      <Layout>
        {/* Language */}
        <Layout.AnnotatedSection
          title="Content language"
          description="AI-generated content (descriptions, SEO, alt text, tags) will be written in this language."
        >
          <Card>
            <Select
              label="Language"
              options={LANGUAGES}
              value={selectedLang}
              onChange={handleLangChange}
            />
          </Card>
        </Layout.AnnotatedSection>

        {/* Plans */}
        <Layout.AnnotatedSection
          title="Plan"
          description="Choose the plan that fits your store."
        >
          <BlockStack gap="400">
            <PlanCard
              name="Free"
              price="$0/mo"
              planKey="free"
              currentPlan={plan}
            />
            <PlanCard
              name="Basic"
              price="$4.99/mo"
              planKey="basic"
              currentPlan={plan}
            />
            <PlanCard
              name="AI"
              price="$9.99/mo"
              planKey="ai"
              currentPlan={plan}
            />
          </BlockStack>
        </Layout.AnnotatedSection>
      </Layout>
    </Page>
  );
}
