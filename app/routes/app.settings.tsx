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
  Select,
  List,
} from "@shopify/polaris";
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
  const shop = await prisma.shop.findUnique({ where: { domain: session.shop } });
  return json({ plan, language: shop?.language || "en" });
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin, billing, session } = await authenticate.admin(request);
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
      const amount = targetPlan === "ai" ? 9.99 : 4.99;

      // Create a subscription request -- redirects merchant to Shopify approval page
      const response = await admin.graphql(
        `
        mutation CreateSubscription($name: String!, $amount: Decimal!, $returnUrl: URL!) {
          appSubscriptionCreate(
            name: $name
            test: true
            returnUrl: $returnUrl
            lineItems: [{
              plan: {
                appRecurringPricingDetails: {
                  price: { amount: $amount, currencyCode: USD }
                  interval: EVERY_30_DAYS
                }
              }
            }]
          ) {
            appSubscription { id }
            confirmationUrl
            userErrors { field message }
          }
        }
      `,
        {
          variables: {
            name: planName,
            amount,
            returnUrl: `${process.env.SHOPIFY_APP_URL}/app/settings`,
          },
        },
      );

      const data = await response.json();
      const { confirmationUrl, userErrors } =
        data.data.appSubscriptionCreate;

      if (userErrors.length > 0) {
        return json(
          { error: userErrors.map((e: any) => e.message).join(", ") },
          { status: 400 },
        );
      }

      if (confirmationUrl) {
        return redirect(confirmationUrl);
      }
    }
  }

  return redirect("/app/settings");
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
        <Layout.AnnotatedSection
          title="Content language"
          description="AI-generated content will be written in this language."
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

        <Layout.AnnotatedSection
          title="Plan"
          description="Choose the plan that fits your store."
        >
          <BlockStack gap="400">
            {/* Free */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">Free</Text>
                    <Text as="p" variant="bodySm" tone="subdued">$0/mo</Text>
                  </BlockStack>
                  {plan === "free" && <Badge tone="success">Current</Badge>}
                </InlineStack>
                <Text as="p" variant="bodySm">
                  Scan up to 10 products. See completeness scores and issues.
                </Text>
              </BlockStack>
            </Card>

            {/* Basic */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">Basic</Text>
                    <Text as="p" variant="bodySm" tone="subdued">$4.99/mo</Text>
                  </BlockStack>
                  {plan === "basic" ? (
                    <Badge tone="success">Current</Badge>
                  ) : plan === "free" ? (
                    <Form method="post">
                      <input type="hidden" name="intent" value="plan" />
                      <input type="hidden" name="plan" value="basic" />
                      <Button submit size="slim">Upgrade</Button>
                    </Form>
                  ) : null}
                </InlineStack>
                <Text as="p" variant="bodySm">
                  Everything in Free, plus unlimited product scanning.
                </Text>
              </BlockStack>
            </Card>

            {/* AI */}
            <Card>
              <BlockStack gap="300">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">AI</Text>
                    <Text as="p" variant="bodySm" tone="subdued">$9.99/mo</Text>
                  </BlockStack>
                  {plan === "ai" ? (
                    <Badge tone="success">Current</Badge>
                  ) : (
                    <Form method="post">
                      <input type="hidden" name="intent" value="plan" />
                      <input type="hidden" name="plan" value="ai" />
                      <Button submit size="slim" variant="primary">Upgrade</Button>
                    </Form>
                  )}
                </InlineStack>
                <Text as="p" variant="bodySm">
                  Everything in Basic, plus AI-generated descriptions, SEO
                  titles, alt text, and tags with one-click apply.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.AnnotatedSection>
      </Layout>
    </Page>
  );
}
