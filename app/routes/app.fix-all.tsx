import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, useRouteError } from "@remix-run/react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
  ProgressBar,
  Divider,
  Checkbox,
  Button,
} from "@shopify/polaris";
import { useState, useEffect, useCallback, useRef } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { AppError } from "../components/AppError";
import { SCAN_POLL_INTERVAL_MS } from "../lib/constants";

interface FixableIssue {
  issueId: string;
  productGid: string;
  productTitle: string;
  issueType: string;
  issueLabel: string;
}

const ISSUE_TYPE_LABELS: Record<string, string> = {
  missing_alt_text: "Alt text",
  missing_seo_title: "SEO metadata",
  missing_description: "Descriptions",
  short_description: "Short descriptions",
  missing_category: "Categories",
  no_tags: "Tags",
  missing_product_type: "Product type",
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const shop = await prisma.shop.findUnique({
    where: { domain: session.shop },
  });

  if (!shop) return json({ issues: [] as FixableIssue[], typeCounts: {} as Record<string, number> });

  const latestScan = await prisma.scan.findFirst({
    where: { shopId: shop.id, status: "completed" },
    orderBy: { startedAt: "desc" },
  });

  if (!latestScan) return json({ issues: [] as FixableIssue[], typeCounts: {} as Record<string, number> });

  const productScores = await prisma.productScore.findMany({
    where: { scanId: latestScan.id },
    include: {
      issues: {
        where: { aiFixable: true, fixedAt: null },
      },
    },
    orderBy: { score: "asc" },
  });

  const SEO_TYPES = new Set([
    "missing_seo_title",
    "missing_seo_description",
    "short_seo_description",
  ]);

  const issues: FixableIssue[] = [];
  const typeCounts: Record<string, number> = {};

  for (const ps of productScores) {
    const seenTypes = new Set<string>();

    for (const issue of ps.issues) {
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
        typeCounts["missing_seo_title"] = (typeCounts["missing_seo_title"] || 0) + 1;
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
        typeCounts[issue.type] = (typeCounts[issue.type] || 0) + 1;
      }
    }
  }

  return json({ issues, typeCounts });
}

export default function FixAll() {
  const { issues, typeCounts } = useLoaderData<typeof loader>();

  // Selected issue types (all enabled by default)
  const availableTypes = Object.keys(typeCounts);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    new Set(availableTypes),
  );

  const filteredIssues = issues.filter((i) => selectedTypes.has(i.issueType));

  const createFetcher = useFetcher<{ batchId?: string; error?: string }>();
  const statusFetcher = useFetcher<{ batch?: { id: string; status: string; totalIssues: number; completedIssues: number; failedIssues: number }; error?: string }>();
  const cancelFetcher = useFetcher<{ success?: boolean }>();
  const undoFetcher = useFetcher<{ success?: boolean; undoneCount?: number }>();

  const [batchId, setBatchId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const batch = statusFetcher.data?.batch;
  const isStarting = createFetcher.state !== "idle";
  const isCancelling = cancelFetcher.state !== "idle";
  const isUndoing = undoFetcher.state !== "idle";

  const isRunning = batch?.status === "running" || batch?.status === "pending";
  const isCompleted = batch?.status === "completed";
  const isCancelled = batch?.status === "cancelled";
  const allDone = isCompleted || isCancelled;

  const totalIssues = batch?.totalIssues || 0;
  const completedIssues = batch?.completedIssues || 0;
  const failedIssues = batch?.failedIssues || 0;
  const progress = totalIssues > 0 ? Math.round(((completedIssues + failedIssues) / totalIssues) * 100) : 0;

  // When batch is created, store ID and start polling
  useEffect(() => {
    if (createFetcher.data?.batchId && !batchId) {
      setBatchId(createFetcher.data.batchId);
    }
  }, [createFetcher.data]);

  // Poll batch status
  useEffect(() => {
    if (!batchId) return;

    // Initial fetch
    statusFetcher.load(`/app/fix-batch?id=${batchId}`);

    pollRef.current = setInterval(() => {
      statusFetcher.load(`/app/fix-batch?id=${batchId}`);
    }, SCAN_POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [batchId]);

  // Stop polling when batch is done
  useEffect(() => {
    if (allDone && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [allDone]);

  const toggleType = useCallback((type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }, []);

  const startFixing = useCallback(() => {
    if (filteredIssues.length === 0) return;
    createFetcher.submit(
      {
        action: "create",
        issues: JSON.stringify(
          filteredIssues.map((i) => ({
            issueId: i.issueId,
            productGid: i.productGid,
            issueType: i.issueType,
          })),
        ),
      },
      { method: "POST", action: "/app/fix-batch" },
    );
  }, [filteredIssues, createFetcher]);

  const handleCancel = useCallback(() => {
    if (!batchId) return;
    cancelFetcher.submit(
      { action: "cancel", batchId },
      { method: "POST", action: "/app/fix-batch" },
    );
  }, [batchId, cancelFetcher]);

  const handleUndo = useCallback(() => {
    if (!batchId) return;
    undoFetcher.submit(
      { batchId },
      { method: "POST", action: "/app/undo" },
    );
  }, [batchId, undoFetcher]);

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
        {/* Type selection */}
        {!batchId && !isStarting && (
          <Card roundedAbove="sm">
            <BlockStack gap="400">
              <Text as="h2" variant="headingSm">
                What do you want to fix?
              </Text>
              <Divider />
              <BlockStack gap="200">
                {availableTypes.map((type) => (
                  <InlineStack key={type} align="space-between" blockAlign="center">
                    <Checkbox
                      label={ISSUE_TYPE_LABELS[type] || type}
                      checked={selectedTypes.has(type)}
                      onChange={() => toggleType(type)}
                    />
                    <Badge tone="info" size="small">
                      {typeCounts[type]} products
                    </Badge>
                  </InlineStack>
                ))}
              </BlockStack>
              <Divider />
              <InlineStack align="space-between" blockAlign="center">
                <Text as="span" variant="bodySm" tone="subdued">
                  {filteredIssues.length} fixes selected
                </Text>
                <Button
                  variant="primary"
                  onClick={startFixing}
                  disabled={filteredIssues.length === 0}
                >
                  Start fixing {filteredIssues.length} issues
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* Starting banner */}
        {isStarting && !batchId && (
          <Card roundedAbove="sm">
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">Starting batch fix...</Text>
            </BlockStack>
          </Card>
        )}

        {/* Progress */}
        {batchId && (
          <Card roundedAbove="sm">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm">
                  {allDone
                    ? `Done -- ${completedIssues} fixed${failedIssues > 0 ? `, ${failedIssues} failed` : ""}`
                    : `Fixing... ${completedIssues} of ${totalIssues}`}
                </Text>
                <InlineStack gap="200">
                  {isRunning && (
                    <Button
                      tone="critical"
                      onClick={handleCancel}
                      loading={isCancelling}
                    >
                      Cancel
                    </Button>
                  )}
                  {allDone && (
                    <Button url="/app" variant="primary">
                      Back to dashboard
                    </Button>
                  )}
                </InlineStack>
              </InlineStack>
              <ProgressBar
                progress={progress}
                tone={allDone && failedIssues === 0 ? "success" : "primary"}
                size="small"
              />
            </BlockStack>
          </Card>
        )}

        {/* Background banner */}
        {isRunning && (
          <Banner tone="info">
            <p>You can leave this page. Fixes continue in the background.</p>
          </Banner>
        )}

        {/* Undo all */}
        {allDone && completedIssues > 0 && (
          <Card roundedAbove="sm">
            <InlineStack align="space-between" blockAlign="center">
              <Text as="span" variant="bodySm">
                {undoFetcher.data?.success
                  ? `Undone ${undoFetcher.data.undoneCount} fixes.`
                  : `${completedIssues} fixes were applied.`}
              </Text>
              {!undoFetcher.data?.success && (
                <Button
                  tone="critical"
                  onClick={handleUndo}
                  loading={isUndoing}
                >
                  Undo all fixes
                </Button>
              )}
            </InlineStack>
          </Card>
        )}

        {createFetcher.data?.error && (
          <Banner tone="critical">
            <p>{createFetcher.data.error}</p>
          </Banner>
        )}

        <div style={{ height: "1rem" }} />
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return <AppError error={useRouteError()} />;
}
