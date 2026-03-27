import {
  Card,
  Text,
  ProgressBar,
  InlineStack,
  InlineGrid,
  BlockStack,
  Box,
  Divider,
} from "@shopify/polaris";

interface ScoreCardProps {
  score: number;
  totalProducts: number;
  issueCount: number;
}

function getScoreColor(score: number): "success" | "warning" | "critical" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "critical";
}

function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Good";
  if (score >= 60) return "Needs work";
  if (score >= 40) return "Poor";
  return "Critical";
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return (
    <BlockStack gap="100">
      <Text as="p" variant="headingLg" fontWeight="bold">
        {value}
      </Text>
      <Text as="p" variant="bodySm" tone="subdued">
        {label}
      </Text>
    </BlockStack>
  );
}

export function ScoreCard({ score, totalProducts, issueCount }: ScoreCardProps) {
  const tone = getScoreColor(score);

  return (
    <Card roundedAbove="sm">
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingSm">
            Store health
          </Text>
          <Text as="span" variant="bodySm" tone="subdued">
            {getScoreLabel(score)}
          </Text>
        </InlineStack>

        <ProgressBar progress={score} tone={tone} size="small" />

        <InlineGrid columns={3} gap="400">
          <Metric value={`${score}/100`} label="Health score" />
          <Metric value={totalProducts} label="Products scanned" />
          <Metric value={issueCount} label="Issues found" />
        </InlineGrid>
      </BlockStack>
    </Card>
  );
}
