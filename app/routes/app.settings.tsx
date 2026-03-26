import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, Form } from "@remix-run/react";
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
} from "@shopify/polaris";
import { CheckIcon } from "@shopify/polaris-icons";
import { authenticate, PLANS } from "../shopify.server";
import { getActivePlan, type ActivePlan } from "../services/billing.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const plan = await getActivePlan(request);
  return json({ plan });
}

export async function action({ request }: ActionFunctionArgs) {
  const { billing } = await authenticate.admin(request);
  const formData = await request.formData();
  const targetPlan = formData.get("plan") as string;

  if (targetPlan === "basic" || targetPlan === "ai") {
    const planName = targetPlan === "ai" ? PLANS.AI : PLANS.BASIC;
    await billing.require({
      plans: [planName],
      isTest: true,
      onFailure: async () => redirect("/app/settings"),
    });
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
  const { plan } = useLoaderData<typeof loader>();

  return (
    <Page title="Settings" backAction={{ url: "/app" }}>
      <Layout>
        <Layout.Section>
          <Text as="h2" variant="headingLg">
            Choose your plan
          </Text>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <PlanCard
            name="Free"
            price="$0/mo"
            planKey="free"
            currentPlan={plan}
          />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <PlanCard
            name="Basic"
            price="$4.99/mo"
            planKey="basic"
            currentPlan={plan}
          />
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <PlanCard
            name="AI"
            price="$9.99/mo"
            planKey="ai"
            currentPlan={plan}
          />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
