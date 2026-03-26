import {
  Card,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  Button,
  Divider,
} from "@shopify/polaris";

interface IssueSummary {
  type: string;
  count: number;
  severity: string;
}

const AI_FIXABLE_TYPES = new Set([
  "missing_description",
  "short_description",
  "missing_alt_text",
  "missing_seo_title",
  "missing_seo_description",
  "short_seo_description",
  "missing_product_type",
  "no_tags",
]);

function formatIssueType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function severityTone(
  severity: string,
): "critical" | "warning" | "info" {
  if (severity === "critical") return "critical";
  if (severity === "warning") return "warning";
  return "info";
}

export function IssueBreakdown({ issues }: { issues: IssueSummary[] }) {
  const fixableCount = issues
    .filter((i) => AI_FIXABLE_TYPES.has(i.type))
    .reduce((sum, i) => sum + i.count, 0);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingMd">
            Issues found
          </Text>
          {fixableCount > 0 && (
            <Text as="span" variant="bodySm" tone="subdued">
              {fixableCount} fixable with AI
            </Text>
          )}
        </InlineStack>

        <Divider />

        {issues.map((issue) => (
          <InlineStack
            key={issue.type}
            align="space-between"
            blockAlign="center"
            wrap={false}
          >
            <BlockStack gap="050">
              <Text as="span" variant="bodyMd">
                {formatIssueType(issue.type)}
              </Text>
              <Text as="span" variant="bodySm" tone="subdued">
                {issue.count} {issue.count === 1 ? "product" : "products"}
              </Text>
            </BlockStack>
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <Badge tone={severityTone(issue.severity)}>
                {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
              </Badge>
              {AI_FIXABLE_TYPES.has(issue.type) && (
                <Button size="slim" url="/app/products">
                  Fix
                </Button>
              )}
            </InlineStack>
          </InlineStack>
        ))}
      </BlockStack>
    </Card>
  );
}
