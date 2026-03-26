import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useRevalidator } from "@remix-run/react";
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
  Modal,
  Box,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

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

function PreviewContent({ data }: { data: any }) {
  if (!data?.preview) return null;
  const { type, value } = data.preview;

  if (type === "description") {
    return (
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Generated description</Text>
        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
          <Text as="p" variant="bodyMd">{value}</Text>
        </Box>
      </BlockStack>
    );
  }

  if (type === "seo") {
    return (
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Generated SEO metadata</Text>
        <Box padding="300" background="bg-surface-secondary" borderRadius="200">
          <BlockStack gap="200">
            <Text as="p" variant="bodyMd" fontWeight="bold">{value.seoTitle}</Text>
            <Text as="p" variant="bodySm" tone="subdued">{value.seoDescription}</Text>
          </BlockStack>
        </Box>
      </BlockStack>
    );
  }

  if (type === "alt_text") {
    return (
      <BlockStack gap="300">
        <Text as="h3" variant="headingSm">Generated alt text</Text>
        {value.map((item: any, i: number) => (
          <InlineStack key={i} gap="300" blockAlign="start">
            <Thumbnail source={item.imageUrl} alt="" size="small" />
            <Box padding="300" background="bg-surface-secondary" borderRadius="200">
              <Text as="p" variant="bodySm">{item.altText}</Text>
            </Box>
          </InlineStack>
        ))}
      </BlockStack>
    );
  }

  if (type === "tags") {
    return (
      <BlockStack gap="200">
        <Text as="h3" variant="headingSm">Generated tags</Text>
        <InlineStack gap="200" wrap>
          {value.map((tag: string) => (
            <Badge key={tag}>{tag}</Badge>
          ))}
        </InlineStack>
      </BlockStack>
    );
  }

  if (type === "category") {
    return null; // Category has its own special UI with selectable options
  }

  return null;
}

export default function ProductDetail() {
  const { productGid, product, score } = useLoaderData<typeof loader>();
  const previewFetcher = useFetcher<{ preview?: any; error?: string }>();
  const fixFetcher = useFetcher<{ success?: boolean; error?: string }>();
  const revalidator = useRevalidator();
  const [activePreview, setActivePreview] = useState<{
    issueId: string;
    issueType: string;
  } | null>(null);
  const [selectedCategoryGid, setSelectedCategoryGid] = useState<string | null>(null);

  const isGenerating = previewFetcher.state !== "idle";
  const isFixing = fixFetcher.state !== "idle";

  // When fix succeeds, revalidate page data
  const prevFixData = fixFetcher.data;
  if (prevFixData?.success && activePreview) {
    setActivePreview(null);
    revalidator.revalidate();
  }

  const handlePreview = useCallback(
    (issueId: string, issueType: string) => {
      setActivePreview({ issueId, issueType });
      previewFetcher.submit(
        { productGid, issueType },
        { method: "POST", action: "/app/fix-preview" },
      );
    },
    [productGid, previewFetcher],
  );

  const handleApply = useCallback((extraData?: Record<string, string>) => {
    if (!activePreview) return;
    fixFetcher.submit(
      {
        issueId: activePreview.issueId,
        productGid,
        issueType: activePreview.issueType,
        ...extraData,
      },
      { method: "POST", action: "/app/fix" },
    );
    setActivePreview(null);
    setSelectedCategoryGid(null);
  }, [activePreview, productGid, fixFetcher]);

  if (!product) {
    return (
      <Page title="Product not found" backAction={{ url: "/app/products" }}>
        <Card>
          <Text as="p">This product could not be found.</Text>
        </Card>
      </Page>
    );
  }

  const SEO_TYPES = new Set(["missing_seo_title", "missing_seo_description", "short_seo_description"]);

  // Merge SEO issues into one row
  const rawUnfixed = score?.issues.filter((i) => !i.fixedAt) || [];
  const seoIssues = rawUnfixed.filter((i) => SEO_TYPES.has(i.type));
  const nonSeoIssues = rawUnfixed.filter((i) => !SEO_TYPES.has(i.type));

  const unfixedIssues = [
    ...nonSeoIssues,
    ...(seoIssues.length > 0
      ? [{
          id: seoIssues[0].id,
          type: "missing_seo_title" as const, // triggers both title+desc fix
          severity: "warning" as const,
          field: "seo",
          message: seoIssues.map((i) => i.message).join(". "),
          aiFixable: true,
          fixedAt: null,
          _label: "Missing SEO Metadata",
          _count: seoIssues.length,
        }]
      : []),
  ];

  const rawFixed = score?.issues.filter((i) => i.fixedAt) || [];
  const fixedSeo = rawFixed.filter((i) => SEO_TYPES.has(i.type));
  const fixedNonSeo = rawFixed.filter((i) => !SEO_TYPES.has(i.type));
  const fixedIssues = [
    ...fixedNonSeo,
    ...(fixedSeo.length > 0
      ? [{ ...fixedSeo[0], _label: "SEO Metadata" }]
      : []),
  ];

  return (
    <Page
      title={product.title}
      subtitle={product.productType || undefined}
      backAction={{ url: "/app/products" }}
    >
      <Layout>
        {/* Left: Product info */}
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
                <Divider />
                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">Vendor</Text>
                    <Text as="span" variant="bodySm">{product.vendor || "Not set"}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">Type</Text>
                    <Text as="span" variant="bodySm">{product.productType || "Not set"}</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">Tags</Text>
                    <Text as="span" variant="bodySm">
                      {product.tags.length > 0 ? product.tags.join(", ") : "None"}
                    </Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" variant="bodySm" tone="subdued">Images</Text>
                    <Text as="span" variant="bodySm">{product.imageCount}</Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* SEO Preview */}
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">SEO preview</Text>
                <Divider />
                <Text
                  as="p"
                  variant="bodyMd"
                  fontWeight="semibold"
                  tone={product.seoTitle ? undefined : "critical"}
                >
                  {product.seoTitle || "No SEO title"}
                </Text>
                <Text
                  as="p"
                  variant="bodySm"
                  tone={product.seoDescription ? "subdued" : "critical"}
                >
                  {product.seoDescription || "No SEO description"}
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>

        {/* Right: Score + Issues */}
        <Layout.Section>
          <BlockStack gap="400">
            {/* Score */}
            {score && (
              <Card>
                <BlockStack gap="300">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">Health score</Text>
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

            {/* Fix applied banner */}
            {fixFetcher.data && (
              <Banner tone="success" title="Fix applied">
                <p>The AI fix has been queued and will be applied shortly. Re-scan to see updated scores.</p>
              </Banner>
            )}

            {/* Issues */}
            {unfixedIssues.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Issues ({unfixedIssues.length})
                  </Text>
                  <Divider />
                  {unfixedIssues.map((issue) => (
                    <BlockStack key={issue.id} gap="200">
                      <InlineStack align="space-between" blockAlign="center" wrap={false}>
                        <InlineStack gap="300" blockAlign="center" wrap={false}>
                          <div style={{ minWidth: 70 }}>
                            <Badge
                              tone={
                                issue.severity === "critical"
                                  ? "critical"
                                  : issue.severity === "warning"
                                    ? "warning"
                                    : "info"
                              }
                            >
                              {issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)}
                            </Badge>
                          </div>
                          <BlockStack gap="050">
                            <Text as="span" variant="bodyMd" fontWeight="semibold">
                              {(issue as any)._label || formatIssueType(issue.type)}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {issue.message}
                            </Text>
                          </BlockStack>
                        </InlineStack>
                        {issue.aiFixable && (
                          <Button
                            size="slim"
                            variant="primary"
                            onClick={() => handlePreview(issue.id, issue.type)}
                            loading={
                              isGenerating &&
                              activePreview?.issueId === issue.id
                            }
                          >
                            Preview fix
                          </Button>
                        )}
                      </InlineStack>

                      {/* Inline preview */}
                      {activePreview?.issueId === issue.id &&
                        previewFetcher.data?.preview && (
                          <Box
                            padding="400"
                            background="bg-surface-secondary"
                            borderRadius="200"
                          >
                            <BlockStack gap="300">
                              {/* Category has its own selectable UI */}
                              {previewFetcher.data.preview.type === "category" ? (
                                <BlockStack gap="300">
                                  <Text as="h3" variant="headingSm">
                                    AI suggestion: {previewFetcher.data.preview.value.aiSuggestion}
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Pick a matching Shopify taxonomy category:
                                  </Text>
                                  {previewFetcher.data.preview.value.matches.map((m: any) => (
                                    <InlineStack
                                      key={m.id}
                                      align="space-between"
                                      blockAlign="center"
                                    >
                                      <BlockStack gap="050">
                                        <Text as="span" variant="bodyMd" fontWeight={selectedCategoryGid === m.id ? "bold" : "regular"}>
                                          {m.fullName}
                                        </Text>
                                        {m.isLeaf && (
                                          <Text as="span" variant="bodySm" tone="subdued">Most specific</Text>
                                        )}
                                      </BlockStack>
                                      <Button
                                        size="slim"
                                        variant={selectedCategoryGid === m.id ? "primary" : "secondary"}
                                        onClick={() => setSelectedCategoryGid(m.id)}
                                      >
                                        {selectedCategoryGid === m.id ? "Selected" : "Select"}
                                      </Button>
                                    </InlineStack>
                                  ))}
                                  {previewFetcher.data.preview.value.matches.length === 0 && (
                                    <Text as="p" variant="bodySm" tone="critical">
                                      No matching categories found. Try regenerating.
                                    </Text>
                                  )}
                                </BlockStack>
                              ) : (
                                <PreviewContent data={previewFetcher.data} />
                              )}

                              <InlineStack gap="200">
                                {previewFetcher.data.preview.type === "category" ? (
                                  <Button
                                    variant="primary"
                                    onClick={() => handleApply({ categoryGid: selectedCategoryGid || "" })}
                                    loading={isFixing}
                                    disabled={!selectedCategoryGid}
                                  >
                                    Apply selected category
                                  </Button>
                                ) : (
                                  <Button
                                    variant="primary"
                                    onClick={() => handleApply()}
                                    loading={isFixing}
                                  >
                                    Apply this fix
                                  </Button>
                                )}
                                <Button onClick={() => { setActivePreview(null); setSelectedCategoryGid(null); }}>
                                  Cancel
                                </Button>
                                <Button onClick={() => handlePreview(issue.id, issue.type)}>
                                  Regenerate
                                </Button>
                              </InlineStack>
                            </BlockStack>
                          </Box>
                        )}

                      {activePreview?.issueId === issue.id &&
                        previewFetcher.data?.error && (
                          <Banner tone="critical">
                            <p>{previewFetcher.data.error}</p>
                          </Banner>
                        )}

                      <Divider />
                    </BlockStack>
                  ))}
                </BlockStack>
              </Card>
            )}

            {/* Fixed issues */}
            {fixedIssues.length > 0 && (
              <Card>
                <BlockStack gap="300">
                  <Text as="h2" variant="headingSm" tone="subdued">
                    Fixed ({fixedIssues.length})
                  </Text>
                  {fixedIssues.map((issue) => (
                    <InlineStack key={issue.id} gap="200" blockAlign="center">
                      <Badge tone="success">Fixed</Badge>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {(issue as any)._label || formatIssueType(issue.type)}
                      </Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Card>
            )}

            {/* No issues */}
            {unfixedIssues.length === 0 && fixedIssues.length === 0 && (
              <Banner tone="success">
                <p>No issues found for this product.</p>
              </Banner>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
