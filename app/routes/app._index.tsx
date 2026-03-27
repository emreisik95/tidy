import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useNavigate, useNavigation } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  Spinner,
  Badge,
  Box,
  IndexTable,
  Thumbnail,
  SkeletonPage,
  SkeletonBodyText,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { useEffect, useCallback, useState, useRef } from "react";
import { useRevalidator } from "@remix-run/react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ScoreCard } from "../components/ScoreCard";
import { IssueBreakdown } from "../components/IssueBreakdown";
import { SCAN_POLL_INTERVAL_MS } from "../lib/constants";

interface ProductPreview {
  id: string;
  title: string;
  image: string | null;
  hasDescription: boolean;
  hasAltText: boolean | null;
  hasSeoTitle: boolean;
  score: number | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  // Always fetch product count and preview from Shopify
  const countResponse = await admin.graphql(`
    query {
      productsCount { count }
    }
  `);
  const countData = await countResponse.json();
  const productCount = countData.data?.productsCount?.count ?? 0;

  // Fetch first 10 products for preview table
  const productsResponse = await admin.graphql(`
    query {
      products(first: 10, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            description
            featuredMedia {
              preview { image { url } }
            }
            seo { title }
            media(first: 1) {
              edges {
                node {
                  ... on MediaImage { alt }
                }
              }
            }
          }
        }
      }
    }
  `);
  const productsData = await productsResponse.json();
  const previewProducts: ProductPreview[] = (
    productsData.data?.products?.edges ?? []
  ).map((edge: any) => {
    const p = edge.node;
    const firstMediaAlt = p.media?.edges?.[0]?.node?.alt;
    return {
      id: p.id,
      title: p.title,
      image: p.featuredMedia?.preview?.image?.url ?? null,
      hasDescription: !!(p.description && p.description.trim().length > 10),
      hasAltText: p.media?.edges?.length > 0 ? !!firstMediaAlt : null,
      hasSeoTitle: !!p.seo?.title,
      score: null, // filled after scan
    };
  });

  // Check for existing scan results
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

  // If we have scan results, merge scores into preview
  if (latestScan?.status === "completed" && latestScan.productScores) {
    const scoreMap = new Map(
      latestScan.productScores.map((ps) => [ps.productGid, ps]),
    );
    for (const p of previewProducts) {
      const scored = scoreMap.get(p.id);
      if (scored) p.score = scored.score;
    }
  }

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

  return json({
    productCount,
    previewProducts,
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
    aiFixableCount: latestScan?.productScores
      ? latestScan.productScores.reduce(
          (sum, ps) =>
            sum + ps.issues.filter((i) => i.aiFixable && !i.fixedAt).length,
          0,
        )
      : 0,
    // Quick stats
    shopStats: {
      totalFixes: shop?.totalFixes ?? 0,
      totalScans: shop?.totalScans ?? 0,
    },
    // Scan trend (last 5 snapshots)
    scanTrend: shop
      ? await prisma.scanSnapshot.findMany({
          where: { shopId: shop.id },
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { score: true, issues: true, createdAt: true },
        })
      : [],
  });
}

function StatusDot({ ok }: { ok: boolean | null }) {
  if (ok === null) return <Text as="span" tone="subdued">&mdash;</Text>;
  return (
    <Badge tone={ok ? "success" : "critical"} size="small">
      {ok ? "OK" : "Missing"}
    </Badge>
  );
}

export default function Dashboard() {
  const navigation = useNavigation();
  const { productCount, previewProducts, scan, issueList, totalIssues, aiFixableCount, shopStats, scanTrend } =
    useLoaderData<typeof loader>();
  const scanFetcher = useFetcher<{ scanId: string }>();
  const statusFetcher = useFetcher<{ scan: { status: string } }>();
  const revalidator = useRevalidator();
  const navigate = useNavigate();
  const [activeScanId, setActiveScanId] = useState<string | null>(null);

  if (navigation.state === "loading") {
    return (
      <SkeletonPage primaryAction>
        <BlockStack gap="400">
          <Card><SkeletonBodyText lines={3} /></Card>
          <Card><SkeletonBodyText lines={8} /></Card>
        </BlockStack>
      </SkeletonPage>
    );
  }

  const isScanning = activeScanId !== null || scan?.status === "running" || scan?.status === "pending";
  const hasScanResults = scan?.status === "completed";

  const [showGuide, setShowGuide] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissed = localStorage.getItem("tidy-onboarding-dismissed");
      if (dismissed === "true") setShowGuide(false);
    }
  }, []);

  const dismissGuide = () => {
    setShowGuide(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("tidy-onboarding-dismissed", "true");
    }
  };

  const handleScan = useCallback(() => {
    scanFetcher.submit(null, { method: "POST", action: "/app/scan" });
  }, [scanFetcher]);

  // When scan starts, grab the scan ID and start polling
  useEffect(() => {
    if (scanFetcher.data?.scanId) {
      setActiveScanId(scanFetcher.data.scanId);
    }
  }, [scanFetcher.data]);

  // Poll scan status every 3s while scanning
  useEffect(() => {
    if (!activeScanId) return;
    const interval = setInterval(() => {
      statusFetcher.load(`/app/scan?scanId=${activeScanId}`);
    }, SCAN_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeScanId]);

  // When scan completes, revalidate the page data (no full reload)
  useEffect(() => {
    const scanData = statusFetcher.data?.scan;
    if (scanData?.status === "completed" || scanData?.status === "failed") {
      setActiveScanId(null);
      revalidator.revalidate();
    }
  }, [statusFetcher.data]);

  return (
    <Page
      title="Tidy"
      subtitle={`${productCount} products in your store`}
      primaryAction={
        hasScanResults
          ? { content: "Re-scan", onAction: handleScan, loading: isScanning }
          : { content: "Scan my products", onAction: handleScan, loading: isScanning }
      }
      secondaryActions={
        hasScanResults
          ? [
              { content: "View all products", url: "/app/products" },
            ]
          : []
      }
    >
      <BlockStack gap="500">
        {/* Banners */}
        {isScanning && (
          <Banner tone="info">
            <InlineStack gap="300" blockAlign="center">
              <Spinner size="small" />
              <Text as="span" variant="bodyMd">
                Scanning {productCount} products. This takes under a minute.
              </Text>
            </InlineStack>
          </Banner>
        )}

        {!hasScanResults && showGuide && (
          <Banner title="How Tidy works" onDismiss={dismissGuide} tone="info">
            <p>1. Scan your products to find missing data</p>
            <p>2. Review issues and scores per product</p>
            <p>3. Fix problems with AI or manually in Shopify admin</p>
          </Banner>
        )}

        {!hasScanResults && !isScanning && (
          <Banner tone="warning" title="Your product data hasn't been checked yet">
            <p>
              Hit "Scan my products" to find missing descriptions, alt text,
              SEO fields, and other gaps that hurt your Google and search visibility.
            </p>
          </Banner>
        )}

        {/* Score card - full width */}
        {hasScanResults && (
          <ScoreCard
            score={scan.overallScore ?? 0}
            totalProducts={scan.totalProducts}
            issueCount={totalIssues}
          />
        )}

        {/* Quick stats row */}
        {hasScanResults && (shopStats.totalFixes > 0 || scanTrend.length > 1) && (
          <Card roundedAbove="sm">
            <InlineStack align="space-between" blockAlign="center">
              {shopStats.totalFixes > 0 && (
                <Text as="span" variant="bodySm" tone="subdued">
                  {shopStats.totalFixes} fixes applied total
                </Text>
              )}
              {scanTrend.length > 1 && (() => {
                const current = scanTrend[0].score;
                const previous = scanTrend[1].score;
                const diff = Math.round(current - previous);
                if (diff === 0) return null;
                return (
                  <Badge tone={diff > 0 ? "success" : "critical"} size="small">
                    {diff > 0 ? "+" : ""}{diff} since last scan
                  </Badge>
                );
              })()}
            </InlineStack>
          </Card>
        )}

        {/* Fix all banner -- compact */}
        {hasScanResults && aiFixableCount > 0 && (
          <Banner
            tone="warning"
            title={`${aiFixableCount} issues can be fixed with AI`}
            action={{
              content: "Fix all with AI",
              url: "/app/fix-all",
            }}
          >
            <p>
              Missing descriptions, SEO fields, alt text, and tags.
              Preview each fix before applying.
            </p>
          </Banner>
        )}

        {/* Pre-scan: what Tidy checks */}
        {!hasScanResults && !isScanning && (
          <Card roundedAbove="sm">
            <InlineStack gap="400" align="space-between" wrap>
              {[
                "Image alt text",
                "SEO metadata",
                "Descriptions",
                "Categories",
                "Barcodes",
                "Tags",
              ].map((item) => (
                <Text key={item} as="span" variant="bodySm" tone="subdued">
                  {item}
                </Text>
              ))}
            </InlineStack>
          </Card>
        )}

        {/* Product table -- full width */}
        <Card roundedAbove="sm" padding="0">
          <BlockStack>
            <Box padding="400" paddingBlockEnd="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm">
                  {hasScanResults ? "Recent products" : "Your products"}
                </Text>
                {!hasScanResults && (
                  <Text as="span" variant="bodySm" tone="subdued">
                    Scores appear after scanning
                  </Text>
                )}
              </InlineStack>
            </Box>
            <IndexTable
              itemCount={previewProducts.length}
              headings={[
                { title: "Product" },
                { title: "Description" },
                { title: "Alt text" },
                { title: "SEO" },
                { title: "Score" },
              ]}
              selectable={false}
            >
              {previewProducts.map((product, index) => (
                <IndexTable.Row
                  id={product.id}
                  key={product.id}
                  position={index}
                  onClick={() =>
                    navigate(
                      `/app/products/${encodeURIComponent(product.id)}`,
                    )
                  }
                >
                  <IndexTable.Cell>
                    <InlineStack gap="300" blockAlign="center" wrap={false}>
                      <Thumbnail
                        source={product.image || ImageIcon}
                        alt={product.title}
                        size="small"
                      />
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <Text as="span" variant="bodyMd" fontWeight="semibold">
                          {product.title}
                        </Text>
                      </div>
                    </InlineStack>
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <StatusDot ok={product.hasDescription} />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <StatusDot ok={product.hasAltText} />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <StatusDot ok={product.hasSeoTitle} />
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {product.score !== null ? (
                      <Badge
                        tone={
                          product.score >= 80
                            ? "success"
                            : product.score >= 50
                              ? "warning"
                              : "critical"
                        }
                      >
                        {product.score}
                      </Badge>
                    ) : (
                      <Text as="span" tone="subdued">&mdash;</Text>
                    )}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </BlockStack>
        </Card>

        {/* Issue breakdown -- full width, below table */}
        {hasScanResults && issueList.length > 0 && (
          <IssueBreakdown issues={issueList} />
        )}

        <div style={{ height: "1rem" }} />
      </BlockStack>
    </Page>
  );
}
