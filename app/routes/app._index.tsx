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
  Box,
  List,
  Divider,
  EmptyState,
} from "@shopify/polaris";
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
    if (scanData?.status === "completed" || scanData?.status === "failed") {
      setActiveScanId(null);
      window.location.reload();
    }
  }, [statusFetcher.data]);

  // ── First run: no scan yet ──
  if (!scan) {
    return (
      <Page title="Tidy">
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState
                heading="Check your product data for problems"
                action={{
                  content: "Scan my products",
                  onAction: handleScan,
                  loading: isScanning,
                }}
                image=""
                fullWidth
              >
                <BlockStack gap="300">
                  <Text as="p" variant="bodyMd">
                    Tidy reads every product in your store and checks for
                    missing or incomplete data that hurts your visibility
                    on Google, in search results, and on AI shopping platforms.
                  </Text>
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    What gets checked:
                  </Text>
                  <List>
                    <List.Item>Image alt text</List.Item>
                    <List.Item>SEO titles and descriptions</List.Item>
                    <List.Item>Product descriptions</List.Item>
                    <List.Item>Google product categories</List.Item>
                    <List.Item>Barcodes, tags, vendor info</List.Item>
                  </List>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Takes under a minute. Nothing is changed in your store until you say so.
                  </Text>
                </BlockStack>
              </EmptyState>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <BlockStack gap="400">
              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    After the scan
                  </Text>
                  <List>
                    <List.Item>
                      Each product gets a score out of 100
                    </List.Item>
                    <List.Item>
                      You see exactly which fields are empty
                    </List.Item>
                    <List.Item>
                      AI can write your missing content in one click
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>

              <Card>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">
                    Common problems Tidy finds
                  </Text>
                  <List>
                    <List.Item>
                      Products disapproved in Google Merchant Center
                    </List.Item>
                    <List.Item>
                      Images without alt text (bad for SEO and accessibility)
                    </List.Item>
                    <List.Item>
                      Missing SEO metadata (invisible in search results)
                    </List.Item>
                  </List>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // ── Scanning in progress ──
  if (isScanning || scan.status === "running" || scan.status === "pending") {
    return (
      <Page title="Tidy">
        <Layout>
          <Layout.Section>
            <Banner tone="info">
              <InlineStack gap="300" blockAlign="center">
                <Spinner size="small" />
                <Text as="span" variant="bodyMd">
                  Scanning your products. This takes under a minute.
                </Text>
              </InlineStack>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // ── Scan failed ──
  if (scan.status === "failed") {
    return (
      <Page
        title="Tidy"
        primaryAction={{
          content: "Try again",
          onAction: handleScan,
        }}
      >
        <Layout>
          <Layout.Section>
            <Banner tone="critical" title="Scan failed">
              <p>
                Something went wrong while scanning your products.
                This can happen if another scan is already running.
                Wait a moment and try again.
              </p>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  // ── Results dashboard ──
  return (
    <Page
      title="Tidy"
      primaryAction={{
        content: "Re-scan",
        onAction: handleScan,
        loading: isScanning,
      }}
      secondaryActions={[
        {
          content: "View all products",
          url: "/app/products",
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            <ScoreCard
              score={scan.overallScore ?? 0}
              totalProducts={scan.totalProducts}
              issueCount={totalIssues}
            />

            {issueList.length > 0 && <IssueBreakdown issues={issueList} />}
          </BlockStack>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                Worst scores
              </Text>
              <Divider />
              {lowestProducts.length > 0 ? (
                lowestProducts.map((p) => (
                  <InlineStack
                    key={p.id}
                    align="space-between"
                    blockAlign="center"
                  >
                    <BlockStack gap="050">
                      <Link
                        to={`/app/products/${encodeURIComponent(p.id)}`}
                      >
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {p.title}
                        </Text>
                      </Link>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {p.issueCount}{" "}
                        {p.issueCount === 1 ? "issue" : "issues"}
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
                      {p.score}
                    </Badge>
                  </InlineStack>
                ))
              ) : (
                <Text as="p" variant="bodySm" tone="subdued">
                  No issues found.
                </Text>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
