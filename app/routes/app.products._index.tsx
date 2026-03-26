import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  IndexTable,
  Text,
  Badge,
  BlockStack,
  InlineStack,
  EmptyState,
  Thumbnail,
} from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const pageSize = 25;

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  if (!shop) {
    return json({ products: [], total: 0, page, pageSize });
  }

  const latestScan = await prisma.scan.findFirst({
    where: { shopId: shop.id, status: "completed" },
    orderBy: { startedAt: "desc" },
  });

  if (!latestScan) {
    return json({ products: [], total: 0, page, pageSize });
  }

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

  // Fetch images from Shopify for these products
  const gids = productScores.map((p) => p.productGid);
  let imageMap = new Map<string, string>();

  if (gids.length > 0) {
    const imgResponse = await admin.graphql(
      `
      query ProductImages($ids: [ID!]!) {
        nodes(ids: $ids) {
          ... on Product {
            id
            featuredMedia {
              preview { image { url } }
            }
          }
        }
      }
    `,
      { variables: { ids: gids } },
    );
    const imgData = await imgResponse.json();
    for (const node of imgData.data?.nodes || []) {
      if (node?.id && node?.featuredMedia?.preview?.image?.url) {
        imageMap.set(node.id, node.featuredMedia.preview.image.url);
      }
    }
  }

  return json({
    products: productScores.map((p) => ({
      id: p.id,
      productGid: p.productGid,
      title: p.productTitle,
      image: imageMap.get(p.productGid) || null,
      score: p.score,
      issueCount: p.issues.length,
      criticalCount: p.issues.filter((i) => i.severity === "critical").length,
      warningCount: p.issues.filter((i) => i.severity === "warning").length,
    })),
    total,
    page,
    pageSize,
  });
}

export default function ProductList() {
  const { products, total, page, pageSize } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  if (products.length === 0) {
    return (
      <Page title="Products" backAction={{ url: "/app" }}>
        <Layout>
          <Layout.Section>
            <Card>
              <EmptyState heading="No scan results yet" image="">
                <p>Run a scan from the dashboard to see product scores.</p>
              </EmptyState>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  const totalPages = Math.ceil(total / pageSize);

  return (
    <Page
      title="Products"
      subtitle={`${total} products scanned`}
      backAction={{ url: "/app" }}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            <IndexTable
              itemCount={products.length}
              headings={[
                { title: "Product" },
                { title: "Score" },
                { title: "Critical" },
                { title: "Warnings" },
                { title: "Issues" },
              ]}
              selectable={false}
            >
              {products.map((product, index) => (
                <IndexTable.Row
                  id={product.id}
                  key={product.id}
                  position={index}
                  onClick={() =>
                    navigate(
                      `/app/products/${encodeURIComponent(product.productGid)}`,
                    )
                  }
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
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {product.criticalCount > 0 ? (
                      <Badge tone="critical">{product.criticalCount}</Badge>
                    ) : (
                      <Text as="span" tone="subdued">0</Text>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    {product.warningCount > 0 ? (
                      <Badge tone="warning">{product.warningCount}</Badge>
                    ) : (
                      <Text as="span" tone="subdued">0</Text>
                    )}
                  </IndexTable.Cell>
                  <IndexTable.Cell>
                    <Text as="span" variant="bodyMd">
                      {product.issueCount}
                    </Text>
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          </Card>

          {totalPages > 1 && (
            <BlockStack inlineAlign="center">
              <Text as="p" variant="bodySm" tone="subdued">
                Page {page} of {totalPages}
              </Text>
            </BlockStack>
          )}

          {/* Bottom spacing */}
          <div style={{ height: "2rem" }} />
        </Layout.Section>
      </Layout>
    </Page>
  );
}
