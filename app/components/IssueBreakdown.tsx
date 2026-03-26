import { Card, DataTable, Text, Badge, BlockStack } from "@shopify/polaris";

interface IssueSummary {
  type: string;
  count: number;
  severity: string;
}

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
  const rows = issues.map((issue) => [
    formatIssueType(issue.type),
    <Badge key={issue.type} tone={severityTone(issue.severity)}>
      {issue.severity}
    </Badge>,
    issue.count.toString(),
  ]);

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingMd">
          Issues by Type
        </Text>
        <DataTable
          columnContentTypes={["text", "text", "numeric"]}
          headings={["Issue", "Severity", "Count"]}
          rows={rows}
        />
      </BlockStack>
    </Card>
  );
}
