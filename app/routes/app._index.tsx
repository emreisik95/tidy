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
  Divider,
  IndexTable,
  Thumbnail,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { useEffect, useCallback, useState } from "react";
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
  const { productCount, previewProducts, scan, issueList, totalIssues } =
    useLoaderData<typeof loader>();
  const scanFetcher = useFetcher<{ scanId: string }>();
  const statusFetcher = useFetcher<{ scan: { status: string } }>();
  const [activeScanId, setActiveScanId] = useState<string | null>(null);

  const isScanning = activeScanId !== null;
  const hasScanResults = scan?.status === "completed";

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
          ? [{ content: "View all products", url: "/app/products" }]
          : []
      }
    >
      <Layout>
        {/* Main content */}
        <Layout.Section>
          <BlockStack gap="500">
            {/* Scanning banner */}
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

            {/* Score card (only after scan) */}
            {hasScanResults && (
              <ScoreCard
                score={scan.overallScore ?? 0}
                totalProducts={scan.totalProducts}
                issueCount={totalIssues}
              />
            )}

            {/* Product preview table -- always visible */}
            <Card padding="0">
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
                    { title: "SEO title" },
                    { title: "Score" },
                  ]}
                  selectable={false}
                >
                  {previewProducts.map((product, index) => (
                    <IndexTable.Row
                      id={product.id}
                      key={product.id}
                      position={index}
                    >
                      <IndexTable.Cell>
                        <InlineStack gap="300" blockAlign="center">
                          <Thumbnail
                            source={product.image || ImageIcon}
                            alt={product.title}
                            size="small"
                          />
                          <Text as="span" variant="bodyMd" fontWeight="semibold">
                            {product.title}
                          </Text>
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

            {/* Issue breakdown (only after scan) */}
            {hasScanResults && issueList.length > 0 && (
              <IssueBreakdown issues={issueList} />
            )}
          </BlockStack>
        </Layout.Section>

        {/* Sidebar */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {!hasScanResults ? (
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    What Tidy checks
                  </Text>
                  <Divider />
                  <BlockStack gap="200">
                    {[
                      "Image alt text",
                      "SEO titles and descriptions",
                      "Product descriptions",
                      "Google product categories",
                      "Barcodes and GTINs",
                      "Tags and vendor info",
                    ].map((item) => (
                      <Text key={item} as="p" variant="bodySm">
                        {item}
                      </Text>
                    ))}
                  </BlockStack>
                  <Divider />
                  <Text as="p" variant="bodySm" tone="subdued">
                    Nothing is changed until you approve it.
                  </Text>
                </BlockStack>
              </Card>
            ) : (
              <Card>
                <BlockStack gap="300">
                  <Text as="h3" variant="headingSm">
                    Worst scores
                  </Text>
                  <Divider />
                  {previewProducts
                    .filter((p) => p.score !== null)
                    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
                    .slice(0, 5)
                    .map((p) => (
                      <InlineStack
                        key={p.id}
                        align="space-between"
                        blockAlign="center"
                      >
                        <Link to={`/app/products/${encodeURIComponent(p.id)}`}>
                          <Text as="span" variant="bodySm">
                            {p.title}
                          </Text>
                        </Link>
                        <Badge
                          tone={
                            (p.score ?? 0) >= 80
                              ? "success"
                              : (p.score ?? 0) >= 50
                                ? "warning"
                                : "critical"
                          }
                        >
                          {p.score}
                        </Badge>
                      </InlineStack>
                    ))}
                </BlockStack>
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
