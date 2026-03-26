import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Banner,
  Divider,
  Thumbnail,
  ProgressBar,
} from "@shopify/polaris";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const productGid = decodeURIComponent(params.id || "");

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  const latestScan = shop
    ? await prisma.scan.findFirst({
        where: { shopId: shop.id, status: "completed" },
        orderBy: { startedAt: "desc" },
      })
    : null;

  const productScore = latestScan
    ? await prisma.productScore.findFirst({
        where: { scanId: latestScan.id, productGid },
        include: { issues: true },
      })
    : null;

  // Fetch live product data from Shopify
  const productResponse = await admin.graphql(
    `
    query Product($id: ID!) {
      product(id: $id) {
        title
        description
        productType
        vendor
        tags
        status
        seo { title description }
        featuredMedia {
          preview { image { url altText } }
        }
        media(first: 5) {
          edges {
            node {
              ... on MediaImage {
                id
                alt
                image { url }
              }
            }
          }
        }
      }
    }
  `,
    { variables: { id: productGid } },
  );

  const productData = await productResponse.json();
  const product = productData.data?.product;

  return json({
    productGid,
    product: product
      ? {
          title: product.title,
          description: product.description || "",
          productType: product.productType || "",
          vendor: product.vendor || "",
          tags: product.tags || [],
          status: product.status,
          seoTitle: product.seo?.title || "",
          seoDescription: product.seo?.description || "",
          featuredImage:
            product.featuredMedia?.preview?.image?.url || null,
          imageCount: product.media?.edges?.length || 0,
        }
      : null,
    score: productScore
      ? {
          score: productScore.score,
          maxScore: productScore.maxScore,
          issues: productScore.issues.map((i) => ({
            id: i.id,
            type: i.type,
            severity: i.severity,
            field: i.field,
            message: i.message,
            aiFixable: i.aiFixable,
            fixedAt: i.fixedAt,
          })),
        }
      : null,
  });
}

function formatIssueType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProductDetail() {
  const { productGid, product, score } = useLoaderData<typeof loader>();
  const fixFetcher = useFetcher();

  if (!product) {
    return (
      <Page title="Product not found" backAction={{ url: "/app/products" }}>
        <Card>
          <Text as="p">This product could not be found.</Text>
        </Card>
      </Page>
    );
  }

  const unfixedIssues =
    score?.issues.filter((i) => !i.fixedAt) || [];
  const fixableIssues = unfixedIssues.filter((i) => i.aiFixable);

  return (
    <Page
      title={product.title}
      subtitle={product.productType || undefined}
      backAction={{ url: "/app/products" }}
    >
      <Layout>
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="300">
                {product.featuredImage && (
                  <Thumbnail
                    source={product.featuredImage}
                    alt={product.title}
                    size="large"
                  />
                )}
                <Text as="h3" variant="headingSm">
                  Product Info
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Vendor: {product.vendor || "Not set"}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Type: {product.productType || "Not set"}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Tags: {product.tags.length > 0 ? product.tags.join(", ") : "None"}
                </Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  Images: {product.imageCount}
                </Text>
              </BlockStack>
            </Card>

            {/* SEO Preview */}
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">
                  SEO Preview
                </Text>
                <Text
                  as="p"
                  variant="bodyMd"
                  fontWeight="semibold"
                  tone={product.seoTitle ? undefined : "critical"}
                >
                  {product.seoTitle || "No SEO title set"}
                </Text>
                <Text
                  as="p"
                  variant="bodySm"
                  tone={product.seoDescription ? "subdued" : "critical"}
                >
                  {product.seoDescription || "No SEO description set"}
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="400">
            {/* Score Card */}
            {score && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Completeness Score
                    </Text>
                    <Text
                      as="p"
                      variant="headingLg"
                      tone={
                        score.score >= 80
                          ? "success"
                          : score.score >= 50
                            ? "caution"
                            : "critical"
                      }
                    >
                      {score.score}/{score.maxScore}
                    </Text>
                  </InlineStack>
                  <ProgressBar
                    progress={score.score}
                    tone={
                      score.score >= 80
                        ? "success"
                        : score.score >= 50
                          ? "warning"
                          : "critical"
                    }
                    size="small"
                  />
                </BlockStack>
              </Card>
            )}

            {/* Fix All Button */}
            {fixableIssues.length > 0 && (
              <Banner tone="warning">
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="span">
                    {fixableIssues.length} issues can be fixed with AI
                  </Text>
                  <Button
                    variant="primary"
                    onClick={() => {
                      for (const issue of fixableIssues) {
                        fixFetcher.submit(
                          {
                            issueId: issue.id,
                            productGid,
                            issueType: issue.type,
                          },
                          { method: "POST", action: "/app/fix" },
                        );
                      }
                    }}
                    loading={fixFetcher.state !== "idle"}
                  >
                    Fix all with AI
                  </Button>
                </InlineStack>
              </Banner>
            )}

            {/* Issues List */}
            {unfixedIssues.length > 0 ? (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Issues ({unfixedIssues.length})
                  </Text>
                  {unfixedIssues.map((issue) => (
                    <div key={issue.id}>
                      <InlineStack
                        align="space-between"
                        blockAlign="center"
                        gap="200"
                      >
                        <BlockStack gap="100">
                          <InlineStack gap="200" blockAlign="center">
                            <Badge
                              tone={
                                issue.severity === "critical"
                                  ? "critical"
                                  : issue.severity === "warning"
                                    ? "warning"
                                    : "info"
                              }
                            >
                              {issue.severity}
                            </Badge>
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {formatIssueType(issue.type)}
                            </Text>
                          </InlineStack>
                          <Text as="p" variant="bodySm" tone="subdued">
                            {issue.message}
                          </Text>
                        </BlockStack>
                        {issue.aiFixable && (
                          <Button
                            size="slim"
                            onClick={() => {
                              fixFetcher.submit(
                                {
                                  issueId: issue.id,
                                  productGid,
                                  issueType: issue.type,
                                },
                                { method: "POST", action: "/app/fix" },
                              );
                            }}
                            loading={fixFetcher.state !== "idle"}
                          >
                            Fix with AI
                          </Button>
                        )}
                      </InlineStack>
                      <Divider />
                    </div>
                  ))}
                </BlockStack>
              </Card>
            ) : score ? (
              <Banner tone="success">
                <Text as="span">
                  No issues found. This product looks great!
                </Text>
              </Banner>
            ) : (
              <Banner tone="info">
                <Text as="span">
                  Run a scan from the dashboard to check this product.
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
