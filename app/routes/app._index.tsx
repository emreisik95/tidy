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
  InlineGrid,
  Banner,
  Spinner,
  Badge,
  Divider,
} from "@shopify/polaris";
import { CheckCircleIcon } from "@shopify/polaris-icons";
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

function StepItem({
  number,
  icon,
  title,
  description,
}: {
  number: string;
  icon: any;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack gap="200" blockAlign="center">
          <Text as="span" variant="headingLg" tone="subdued">
            {number}
          </Text>
          <Text as="h3" variant="headingSm">
            {title}
          </Text>
        </InlineStack>
        <Text as="p" variant="bodySm" tone="subdued">
          {description}
        </Text>
      </BlockStack>
    </Card>
  );
}

function OnboardingView({ onScan, isScanning }: { onScan: () => void; isScanning: boolean }) {
  return (
    <Page title="Tidy">
      <BlockStack gap="600">
        {/* Hero */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingLg">
              Your products have blind spots.
            </Text>
            <Text as="p" variant="bodyMd">
              Missing alt text, empty SEO fields, no Google categories —
              these gaps cost you traffic and sales. Tidy checks every
              product in your catalog and tells you exactly what to fix.
            </Text>
            <Box>
              <Button variant="primary" size="large" onClick={onScan} loading={isScanning}>
                Scan my products
              </Button>
            </Box>
          </BlockStack>
        </Card>

        {/* How it works - 3 steps in a grid */}
        <BlockStack gap="300">
          <Text as="h2" variant="headingMd">
            How it works
          </Text>
          <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
            <StepItem
              number="1"
              icon={SearchIcon}
              title="Scan"
              description="Tidy pulls every product and checks 11 data points: titles, descriptions, images, alt text, SEO fields, categories, barcodes, and tags."
            />
            <StepItem
              number="2"
              icon={AlertTriangleIcon}
              title="See what's broken"
              description="Each product gets a score out of 100. You'll see exactly which fields are empty, which images lack alt text, and what Google will reject."
            />
            <StepItem
              number="3"
              icon={MagicIcon}
              title="Fix with one click"
              description="AI writes your missing descriptions, SEO titles, alt text, and tags. Review, apply, move on. No spreadsheets, no freelancers."
            />
          </InlineGrid>
        </BlockStack>

        {/* Why it matters */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">
              Why this matters
            </Text>
            <Divider />
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
              <BlockStack gap="100">
                <Text as="p" variant="headingSm">
                  Google Merchant Center
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Missing categories and GTINs get your products
                  disapproved. No Shopping ads, no sales.
                </Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" variant="headingSm">
                  Search rankings
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Empty SEO titles and descriptions mean Google has nothing
                  to show. Your products stay invisible.
                </Text>
              </BlockStack>
              <BlockStack gap="100">
                <Text as="p" variant="headingSm">
                  AI shopping
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  ChatGPT, Perplexity, and Google AI need structured data
                  to recommend products. Gaps mean you're skipped.
                </Text>
              </BlockStack>
            </InlineGrid>
          </BlockStack>
        </Card>
      </BlockStack>
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
