import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
  ProgressBar,
  Spinner,
  Divider,
} from "@shopify/polaris";
import { useState, useEffect, useCallback, useRef } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

interface FixableIssue {
  issueId: string;
  productGid: string;
  productTitle: string;
  issueType: string;
  issueLabel: string;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  if (!shop) return json({ issues: [] as FixableIssue[] });

  const latestScan = await prisma.scan.findFirst({
    where: { shopId: shop.id, status: "completed" },
    orderBy: { startedAt: "desc" },
  });

  if (!latestScan) return json({ issues: [] as FixableIssue[] });

  const productScores = await prisma.productScore.findMany({
    where: { scanId: latestScan.id },
    include: {
      issues: {
        where: { aiFixable: true, fixedAt: null },
      },
    },
    orderBy: { score: "asc" },
  });

  // Deduplicate SEO issues per product (they get fixed together)
  const SEO_TYPES = new Set([
    "missing_seo_title",
    "missing_seo_description",
    "short_seo_description",
  ]);

  const issues: FixableIssue[] = [];
  for (const ps of productScores) {
    const seenTypes = new Set<string>();

    for (const issue of ps.issues) {
      // Group SEO issues into one
      if (SEO_TYPES.has(issue.type)) {
        if (seenTypes.has("seo")) continue;
        seenTypes.add("seo");
        issues.push({
          issueId: issue.id,
          productGid: ps.productGid,
          productTitle: ps.productTitle,
          issueType: issue.type,
          issueLabel: "SEO Metadata",
        });
      } else {
        const label = issue.type
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        issues.push({
          issueId: issue.id,
          productGid: ps.productGid,
          productTitle: ps.productTitle,
          issueType: issue.type,
          issueLabel: label,
        });
      }
    }
  }

  return json({ issues });
}

type FixStatus = "pending" | "fixing" | "done" | "failed";

export default function FixAll() {
  const { issues } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();
  const [statuses, setStatuses] = useState<Record<string, FixStatus>>({});
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const indexRef = useRef(-1);

  const doneCount = Object.values(statuses).filter((s) => s === "done").length;
  const failedCount = Object.values(statuses).filter((s) => s === "failed").length;
  const progress = issues.length > 0 ? Math.round(((doneCount + failedCount) / issues.length) * 100) : 0;
  const allDone = doneCount + failedCount === issues.length && issues.length > 0;

  const startFixing = useCallback(() => {
    if (issues.length === 0) return;
    setIsRunning(true);
    const initial: Record<string, FixStatus> = {};
    issues.forEach((i) => { initial[i.issueId] = "pending"; });
    setStatuses(initial);
    setCurrentIndex(0);
    indexRef.current = 0;
  }, [issues]);

  // Process current issue
  useEffect(() => {
    if (!isRunning || currentIndex < 0 || currentIndex >= issues.length) return;
    if (fetcher.state !== "idle") return;

    const issue = issues[currentIndex];
    setStatuses((prev) => ({ ...prev, [issue.issueId]: "fixing" }));

    fetcher.submit(
      {
        issueId: issue.issueId,
        productGid: issue.productGid,
        issueType: issue.issueType,
      },
      { method: "POST", action: "/app/fix" },
    );
  }, [currentIndex, isRunning, fetcher.state]);

  // Handle fix result and move to next
  useEffect(() => {
    if (!isRunning || fetcher.state !== "idle" || !fetcher.data) return;
    if (indexRef.current < 0 || indexRef.current >= issues.length) return;

    const issue = issues[indexRef.current];
    const success = fetcher.data.success;

    setStatuses((prev) => ({
      ...prev,
      [issue.issueId]: success ? "done" : "failed",
    }));

    const nextIndex = indexRef.current + 1;
    indexRef.current = nextIndex;

    if (nextIndex < issues.length) {
      setCurrentIndex(nextIndex);
    } else {
      setIsRunning(false);
    }
  }, [fetcher.data, fetcher.state]);

  if (issues.length === 0) {
    return (
      <Page title="Fix all with AI" backAction={{ url: "/app" }}>
        <Banner tone="success">
          <p>No AI-fixable issues found. Your products look good.</p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page title="Fix all with AI" backAction={{ url: "/app" }}>
      <BlockStack gap="500">
        {/* Progress */}
        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="h2" variant="headingMd">
                {allDone
                  ? `Done - ${doneCount} fixed, ${failedCount} failed`
                  : isRunning
                    ? `Fixing... ${doneCount} of ${issues.length}`
                    : `${issues.length} issues to fix across your products`}
              </Text>
              {!isRunning && !allDone && (
                <button
                  onClick={startFixing}
                  style={{
                    padding: "8px 16px",
                    background: "#3d3d3d",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  Start fixing
                </button>
              )}
            </InlineStack>
            <ProgressBar
              progress={progress}
              tone={allDone && failedCount === 0 ? "success" : progress > 0 ? "primary" : "subdued"}
              size="small"
            />
            <Text as="p" variant="bodySm" tone="subdued">
              Each fix generates AI content and applies it to your Shopify product. This takes a few seconds per issue.
            </Text>
          </BlockStack>
        </Card>

        {/* Issue list */}
        <Card>
          <BlockStack gap="200">
            {issues.map((issue) => {
              const status = statuses[issue.issueId] || "pending";
              return (
                <div key={issue.issueId}>
                  <InlineStack
                    align="space-between"
                    blockAlign="center"
                    gap="200"
                  >
                    <BlockStack gap="050">
                      <Text as="span" variant="bodyMd" fontWeight="semibold">
                        {issue.productTitle}
                      </Text>
                      <Text as="span" variant="bodySm" tone="subdued">
                        {issue.issueLabel}
                      </Text>
                    </BlockStack>
                    <div style={{ minWidth: 80, textAlign: "right" }}>
                      {status === "pending" && (
                        <Badge tone="info">Pending</Badge>
                      )}
                      {status === "fixing" && (
                        <InlineStack gap="100" blockAlign="center">
                          <Spinner size="small" />
                          <Text as="span" variant="bodySm">Fixing</Text>
                        </InlineStack>
                      )}
                      {status === "done" && (
                        <Badge tone="success">Done</Badge>
                      )}
                      {status === "failed" && (
                        <Badge tone="critical">Failed</Badge>
                      )}
                    </div>
                  </InlineStack>
                  <Divider />
                </div>
              );
            })}
          </BlockStack>
        </Card>
        <div style={{ height: "1rem" }} />
      </BlockStack>
    </Page>
  );
}
