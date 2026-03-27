import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate, useSearchParams } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  EmptyState,
  Thumbnail,
  Box,
  ProgressBar,
  Divider,
  Button,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  if (!shop) {
    return json({ products: [], total: 0, page: 1, pageSize: 10 });
  }

  const latestScan = await prisma.scan.findFirst({
    where: { shopId: shop.id, status: "completed" },
    orderBy: { startedAt: "desc" },
  });

  if (!latestScan) {
    return json({ products: [], total: 0, page: 1, pageSize: 10 });
  }

  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
  const pageSize = 10;

  const [productScores, total] = await Promise.all([
    prisma.productScore.findMany({
      where: { scanId: latestScan.id },
      include: { issues: true },
      orderBy: { score: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.productScore.count({ where: { scanId: latestScan.id } }),
  ]);

  // Fetch images
  const gids = productScores.map((p) => p.productGid);
  const imageMap = new Map<string, string>();

  if (gids.length > 0) {
    const imgResponse = await admin.graphql(
      `query ProductImages($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            featuredMedia { preview { image { url } } }
          }
        }
      }`,
      { variables: { ids: gids } },
    );
    const imgData = await imgResponse.json();
    for (const node of imgData.data?.nodes || []) {
      if (node?.id && node?.featuredMedia?.preview?.image?.url) {
        imageMap.set(node.id, node.featuredMedia.preview.image.url);
      }
    }
  }

  const SEO_TYPES = new Set(["missing_seo_title", "missing_seo_description", "short_seo_description"]);

  return json({
    products: productScores.map((p) => {
      // Group issues, merge SEO
      const unfixed = p.issues.filter((i) => !i.fixedAt);
      const hasSeoIssue = unfixed.some((i) => SEO_TYPES.has(i.type));
      const nonSeoIssues = unfixed.filter((i) => !SEO_TYPES.has(i.type));

      const issueLabels = [
        ...nonSeoIssues.map((i) => ({
          type: i.type,
          label: i.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          severity: i.severity,
          aiFixable: i.aiFixable,
        })),
        ...(hasSeoIssue
          ? [{ type: "missing_seo_title", label: "SEO Metadata", severity: "warning" as const, aiFixable: true }]
          : []),
      ];

      return {
        id: p.id,
        productGid: p.productGid,
        title: p.productTitle,
        image: imageMap.get(p.productGid) || null,
        score: p.score,
        issueCount: unfixed.length,
        fixedCount: p.issues.filter((i) => i.fixedAt).length,
        issues: issueLabels,
      };
    }),
    total,
    page,
    pageSize,
  });
}

function scoreTone(score: number): "success" | "warning" | "critical" {
  if (score >= 80) return "success";
  if (score >= 50) return "warning";
  return "critical";
}

export default function ProductList() {
  const { products, total, page, pageSize } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [, setSearchParams] = useSearchParams();
  const totalPages = Math.ceil(total / pageSize);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  if (products.length === 0) {
    return (
      <Page title="Products" backAction={{ url: "/app" }}>
        <Card>
          <EmptyState heading="No scan results yet" image="">
            <p>Run a scan from the dashboard to see product scores.</p>
          </EmptyState>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Products"
      subtitle={`${products.length} products scanned`}
      backAction={{ url: "/app" }}
    >
      <BlockStack gap="400">
        {products.map((product) => (
          <Card roundedAbove="sm" key={product.id}>
            <BlockStack gap="300">
              {/* Product header */}
              <InlineStack align="space-between" blockAlign="center" wrap={false}>
                <InlineStack gap="300" blockAlign="center" wrap={false}>
                  <Thumbnail
                    source={product.image || ImageIcon}
                    alt={product.title}
                    size="small"
                  />
                  <BlockStack gap="050">
                    <Text as="span" variant="bodyMd" fontWeight="semibold">
                      {product.title}
                    </Text>
                    <InlineStack gap="200">
                      {product.issueCount > 0 ? (
                        <Text as="span" variant="bodySm" tone="subdued">
                          {product.issueCount} {product.issueCount === 1 ? "issue" : "issues"}
                        </Text>
                      ) : (
                        <Text as="span" variant="bodySm" tone="success">
                          No issues
                        </Text>
                      )}
                      {product.fixedCount > 0 && (
                        <Badge tone="success" size="small">
                          {product.fixedCount} fixed
                        </Badge>
                      )}
                    </InlineStack>
                  </BlockStack>
                </InlineStack>

                <InlineStack gap="200" blockAlign="center">
                  <div style={{ width: 60 }}>
                    <ProgressBar
                      progress={product.score}
                      tone={scoreTone(product.score)}
                      size="small"
                    />
                  </div>
                  <Badge tone={scoreTone(product.score)}>
                    {product.score}
                  </Badge>
                </InlineStack>
              </InlineStack>

              {/* Issue chips */}
              {product.issues.length > 0 && (
                <>
                  <Divider />
                  <InlineStack gap="200" wrap>
                    {product.issues.map((issue) => (
                      <Badge
                        key={issue.type}
                        tone={
                          issue.severity === "critical"
                            ? "critical"
                            : issue.severity === "warning"
                              ? "warning"
                              : "info"
                        }
                        size="small"
                      >
                        {issue.label}
                      </Badge>
                    ))}
                    <Button
                      size="slim"
                      onClick={() =>
                        navigate(
                          `/app/products/${encodeURIComponent(product.productGid)}`,
                        )
                      }
                    >
                      Fix
                    </Button>
                  </InlineStack>
                </>
              )}
            </BlockStack>
          </Card>
        ))}

        {/* Pagination */}
        {totalPages > 1 && (
          <Card roundedAbove="sm">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" variant="bodySm" tone="subdued">
                Page {page} of {totalPages} ({total} products)
              </Text>
              <InlineStack gap="200">
                <Button
                  size="slim"
                  disabled={!hasPrev}
                  onClick={() => setSearchParams({ page: String(page - 1) })}
                >
                  Previous
                </Button>
                <Button
                  size="slim"
                  disabled={!hasNext}
                  onClick={() => setSearchParams({ page: String(page + 1) })}
                >
                  Next
                </Button>
              </InlineStack>
            </InlineStack>
          </Card>
        )}

        {/* Bottom spacing */}
        <div style={{ height: "1rem" }} />
      </BlockStack>
    </Page>
  );
}
