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
    if (
      scanData?.status === "completed" ||
      scanData?.status === "failed"
    ) {
      setActiveScanId(null);
      window.location.reload();
    }
  }, [statusFetcher.data]);

  return (
    <Page title="Tidy">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {isScanning && (
              <Banner tone="info">
                <InlineStack gap="200" blockAlign="center">
                  <Spinner size="small" />
                  <Text as="span" variant="bodyMd">
                    Scanning your products...
                  </Text>
                </InlineStack>
              </Banner>
            )}

            {scan && scan.status === "completed" ? (
              <ScoreCard
                score={scan.overallScore ?? 0}
                totalProducts={scan.totalProducts}
                issueCount={totalIssues}
              />
            ) : !isScanning ? (
              <Card>
                <BlockStack gap="300" inlineAlign="center">
                  <Text as="h2" variant="headingLg">
                    Welcome to Tidy
                  </Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Scan your product catalog to find missing data, SEO
                    gaps, and completeness issues.
                  </Text>
                  <Button
                    variant="primary"
                    onClick={handleScan}
                    loading={isScanning}
                  >
                    Run your first scan
                  </Button>
                </BlockStack>
              </Card>
            ) : null}

            {scan && scan.status === "completed" && (
              <>
                <Button onClick={handleScan} loading={isScanning}>
                  Re-scan products
                </Button>

                {issueList.length > 0 && (
                  <IssueBreakdown issues={issueList} />
                )}

                {lowestProducts.length > 0 && (
                  <Card>
                    <BlockStack gap="300">
                      <Text as="h2" variant="headingMd">
                        Products needing attention
                      </Text>
                      {lowestProducts.map((p) => (
                        <InlineStack
                          key={p.id}
                          align="space-between"
                          blockAlign="center"
                        >
                          <Link
                            to={`/app/products/${encodeURIComponent(p.id)}`}
                          >
                            {p.title}
                          </Link>
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
              </>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
