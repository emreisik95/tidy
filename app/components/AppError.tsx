import { Card, Page, Text, BlockStack, Button } from "@shopify/polaris";

export function AppError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong";
  return (
    <Page title="Error">
      <Card>
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">Something went wrong</Text>
          <Text as="p" variant="bodyMd" tone="subdued">
            {message}. Try refreshing the page.
          </Text>
          <Button onClick={() => window.location.reload()}>Refresh</Button>
        </BlockStack>
      </Card>
    </Page>
  );
}
