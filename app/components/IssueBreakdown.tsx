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
  "missing_category",
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
  // Only show AI-fixable issues -- no point showing problems we can't solve
  const fixableIssues = issues.filter((i) => AI_FIXABLE_TYPES.has(i.type));
  const fixableCount = fixableIssues.reduce((sum, i) => sum + i.count, 0);

  if (fixableIssues.length === 0) return null;

  return (
    <Card roundedAbove="sm">
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingSm">
            Fixable issues
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {fixableCount} total
          </Text>
        </InlineStack>

        <Divider />

        {fixableIssues.map((issue) => (
          <InlineStack
            key={issue.type}
            align="space-between"
            blockAlign="center"
            wrap={false}
          >
            <BlockStack gap="050">
              <Text as="span" variant="bodySm">
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
              <Button size="slim" url="/app/fix-all">
                Fix
              </Button>
            </InlineStack>
          </InlineStack>
        ))}
      </BlockStack>
    </Card>
  );
}
