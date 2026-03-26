import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  BlockStack,
  InlineStack,
  Banner,
  Spinner,
  Badge,
  Icon,
  Box,
  Divider,
  CalloutCard,
} from "@shopify/polaris";
import {
  SearchIcon,
  AlertTriangleIcon,
  WandIcon,
  CheckCircleIcon,
} from "@shopify/polaris-icons";
import { useEffect, useCallback, useState } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ScoreCard } from "../components/ScoreCard";
import { IssueBreakdown } from "../components/IssueBreakdown";
import { SCAN_POLL_INTERVAL_MS } from "../lib/constants";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });
  const latestScan = shop
    ? await prisma.scan.findFirst({
        where: { shopId: shop.id },
        orderBy: { startedAt: "desc" },
        include: {
          productScores: {
            include: { issues: true },
            orderBy: { score: "asc" },
          },
        },
      })
    : null;

  const issueSummary: Record<string, { count: number; severity: string }> = {};
  let totalIssues = 0;
  if (latestScan?.productScores) {
    for (const ps of latestScan.productScores) {
      for (const issue of ps.issues) {
        if (!issueSummary[issue.type]) {
          issueSummary[issue.type] = { count: 0, severity: issue.severity };
        }
        issueSummary[issue.type].count++;
        totalIssues++;
      }
    }
  }

  const issueList = Object.entries(issueSummary)
    .map(([type, data]) => ({ type, ...data }))
    .sort((a, b) => b.count - a.count);

  const lowestProducts =
    latestScan?.productScores.slice(0, 5).map((ps) => ({
      id: ps.productGid,
      title: ps.productTitle,
      score: ps.score,
      issueCount: ps.issues.length,
    })) || [];

  return json({
    scan: latestScan
      ? {
          id: latestScan.id,
          status: latestScan.status,
          overallScore: latestScan.overallScore,
          totalProducts: latestScan.totalProducts,
          completedAt: latestScan.completedAt,
        }
      : null,
    issueList,
    totalIssues,
    lowestProducts,
  });
}

function OnboardingView({ onScan, isScanning }: { onScan: () => void; isScanning: boolean }) {
  return (
    <Page title="Tidy">
      <Layout>
        {/* Hero */}
        <Layout.Section>
          <CalloutCard
            title="Your products have blind spots. Let's find them."
            illustration="https://cdn.shopify.com/s/files/1/0583/6465/7734/files/search-illustration.png?v=1629150170"
            primaryAction={{
              content: "Scan my products",
              onAction: onScan,
              loading: isScanning,
            }}
          >
            <p>
              Missing alt text, empty SEO fields, no Google categories — these
              gaps cost you traffic and sales. Tidy checks every product in
              your catalog in under a minute.
            </p>
          </CalloutCard>
        </Layout.Section>

        {/* How it works - 3 concrete steps */}
        <Layout.Section>
          <Text as="h2" variant="headingMd">
            How it works
          </Text>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <Box
                  background="bg-fill-info"
                  borderRadius="200"
                  padding="200"
                >
                  <Icon source={SearchIcon} tone="info" />
                </Box>
                <Text as="h3" variant="headingSm">
                  1. Scan
                </Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                Tidy pulls every product from your store and checks 11 data
                points: titles, descriptions, images, alt text, SEO fields,
                categories, barcodes, tags, and more.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <Box
                  background="bg-fill-warning"
                  borderRadius="200"
                  padding="200"
                >
                  <Icon source={AlertTriangleIcon} tone="warning" />
                </Box>
                <Text as="h3" variant="headingSm">
                  2. See what's broken
                </Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                Each product gets a score out of 100. You'll see exactly which
                fields are empty, which images lack alt text, and which
                products Google will reject.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <InlineStack gap="200" blockAlign="center">
                <Box
                  background="bg-fill-success"
                  borderRadius="200"
                  padding="200"
                >
                  <Icon source={WandIcon} tone="success" />
                </Box>
                <Text as="h3" variant="headingSm">
                  3. Fix with one click
                </Text>
              </InlineStack>
              <Text as="p" variant="bodySm" tone="subdued">
                AI writes your missing descriptions, SEO titles, image alt
                text, and tags. Review them, hit apply, and move on. No
                spreadsheets, no freelancers.
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Why it matters */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingMd">
                Why this matters
              </Text>
              <Divider />
              <InlineStack gap="400" align="start" wrap>
                <BlockStack gap="100">
                  <Text as="p" variant="headingSm" tone="critical">
                    Google Merchant Center
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Missing categories and GTINs get your products
                    disapproved. No Shopping ads, no sales.
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="headingSm" tone="caution">
                    Search rankings
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Empty SEO titles and descriptions mean Google has nothing
                    to show. Your products stay invisible.
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p" variant="headingSm" tone="magic">
                    AI shopping
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    ChatGPT, Perplexity, and Google AI need structured product
                    data. Gaps mean you're skipped.
                  </Text>
                </BlockStack>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Bottom CTA */}
        <Layout.Section>
          <InlineStack align="center">
            <Button variant="primary" size="large" onClick={onScan} loading={isScanning}>
              Scan my products
            </Button>
          </InlineStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export default function Dashboard() {
  const { scan, issueList, totalIssues, lowestProducts } =
    useLoaderData<typeof loader>();
  const scanFetcher = useFetcher<{ scanId: string }>();
  const statusFetcher = useFetcher<{ scan: { status: string } }>();
  const [activeScanId, setActiveScanId] = useState<string | null>(null);

  const isScanning = activeScanId !== null;

  const handleScan = useCallback(() => {
    scanFetcher.submit(null, { method: "POST", action: "/app/scan" });
  }, [scanFetcher]);

  useEffect(() => {
    if (scanFetcher.data?.scanId) {
      setActiveScanId(scanFetcher.data.scanId);
    }
  }, [scanFetcher.data]);

  useEffect(() => {
    if (!activeScanId) return;

    const interval = setInterval(() => {
      statusFetcher.load(`/app/scan?scanId=${activeScanId}`);
    }, SCAN_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [activeScanId]);

  useEffect(() => {
    const scanData = statusFetcher.data?.scan;
    if (
      scanData?.status === "completed" ||
      scanData?.status === "failed"
    ) {
      setActiveScanId(null);
      window.location.reload();
    }
  }, [statusFetcher.data]);

  // Show onboarding if no scan has been run yet
  if (!scan) {
    return <OnboardingView onScan={handleScan} isScanning={isScanning} />;
  }

  // Scanning in progress
  if (isScanning || scan.status === "running" || scan.status === "pending") {
    return (
      <Page title="Tidy">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400" inlineAlign="center">
                <Spinner size="large" />
                <Text as="h2" variant="headingMd">
                  Checking your products...
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  This usually takes less than a minute. We're going through
                  every product in your catalog.
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // Results dashboard
  return (
    <Page
      title="Tidy"
      primaryAction={{
        content: "Re-scan products",
        onAction: handleScan,
        loading: isScanning,
      }}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <ScoreCard
              score={scan.overallScore ?? 0}
              totalProducts={scan.totalProducts}
              issueCount={totalIssues}
            />

            {issueList.length > 0 && (
              <IssueBreakdown issues={issueList} />
            )}

            {lowestProducts.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingMd">
                    Products that need the most work
                  </Text>
                  <Divider />
                  {lowestProducts.map((p) => (
                    <InlineStack
                      key={p.id}
                      align="space-between"
                      blockAlign="center"
                    >
                      <BlockStack gap="050">
                        <Link
                          to={`/app/products/${encodeURIComponent(p.id)}`}
                        >
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {p.title}
                          </Text>
                        </Link>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {p.issueCount} {p.issueCount === 1 ? "issue" : "issues"}
                        </Text>
                      </BlockStack>
                      <Badge
                        tone={
                          p.score >= 80
                            ? "success"
                            : p.score >= 50
                              ? "warning"
                              : "critical"
                        }
                      >
                        {p.score}/100
                      </Badge>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Card>
            )}

            {totalIssues === 0 && (
              <Banner tone="success" icon={CheckCircleIcon}>
                <p>All products look good. No issues found.</p>
              </Banner>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
