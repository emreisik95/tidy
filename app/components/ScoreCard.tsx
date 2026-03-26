import {
  Card,
  Text,
  ProgressBar,
  InlineStack,
  BlockStack,
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

export function ScoreCard({ score, totalProducts, issueCount }: ScoreCardProps) {
  const tone = getScoreColor(score);

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between">
          <Text as="h2" variant="headingLg">
            Store Health
          </Text>
          <Text as="p" variant="headingXl" tone={tone}>
            {score}/100
          </Text>
        </InlineStack>
        <ProgressBar progress={score} tone={tone} size="small" />
        <Text as="p" variant="bodyMd" tone="subdued">
          {getScoreLabel(score)} &mdash; {totalProducts} products scanned,{" "}
          {issueCount} issues found
        </Text>
      </BlockStack>
    </Card>
  );
}
