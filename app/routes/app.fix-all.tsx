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
  Spinner,
  Divider,
  Checkbox,
  Button,
} from "@shopify/polaris";
import { useState, useEffect, useCallback, useRef } from "react";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { AppError } from "../components/AppError";

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

type FixStatus = "pending" | "fixing" | "done" | "failed" | "skipped";

export default function FixAll() {
  const { issues, typeCounts } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ success?: boolean; error?: string }>();

  // Selected issue types (all enabled by default)
  const availableTypes = Object.keys(typeCounts);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(
    new Set(availableTypes),
  );

  const filteredIssues = issues.filter((i) => selectedTypes.has(i.issueType));

  const [statuses, setStatuses] = useState<Record<string, FixStatus>>({});
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isRunning, setIsRunning] = useState(false);
  const indexRef = useRef(-1);
  const filteredRef = useRef<FixableIssue[]>([]);

  const doneCount = Object.values(statuses).filter((s) => s === "done").length;
  const failedCount = Object.values(statuses).filter((s) => s === "failed").length;
  // Use ref length when running (stable), filtered length when not yet started
  const totalToFix = filteredRef.current.length > 0 ? filteredRef.current.length : filteredIssues.length;
  const progress = totalToFix > 0 ? Math.round(((doneCount + failedCount) / totalToFix) * 100) : 0;
  const allDone = (doneCount + failedCount) === totalToFix && totalToFix > 0 && isRunning === false;

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
    filteredRef.current = filteredIssues;
    setIsRunning(true);
    const initial: Record<string, FixStatus> = {};
    filteredIssues.forEach((i) => { initial[i.issueId] = "pending"; });
    setStatuses(initial);
    setCurrentIndex(0);
    indexRef.current = 0;
  }, [filteredIssues]);

  useEffect(() => {
    if (!isRunning || currentIndex < 0 || currentIndex >= filteredRef.current.length) return;
    if (fetcher.state !== "idle") return;

    const issue = filteredRef.current[currentIndex];
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

  useEffect(() => {
    if (!isRunning || fetcher.state !== "idle" || !fetcher.data) return;
    if (indexRef.current < 0 || indexRef.current >= filteredRef.current.length) return;

    const issue = filteredRef.current[indexRef.current];
    const success = fetcher.data.success;

    setStatuses((prev) => ({
      ...prev,
      [issue.issueId]: success ? "done" : "failed",
    }));

    const nextIndex = indexRef.current + 1;
    indexRef.current = nextIndex;

    if (nextIndex < filteredRef.current.length) {
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
        {/* Type selection */}
        {!isRunning && !allDone && (
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

        {/* Progress */}
        {(isRunning || allDone) && (
          <Card roundedAbove="sm">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h2" variant="headingSm">
                  {allDone
                    ? `Done -- ${doneCount} fixed${failedCount > 0 ? `, ${failedCount} failed` : ""}`
                    : `Fixing... ${doneCount} of ${totalToFix}`}
                </Text>
                {allDone && (
                  <Button url="/app" variant="primary">
                    Back to dashboard
                  </Button>
                )}
              </InlineStack>
              <ProgressBar
                progress={progress}
                tone={allDone && failedCount === 0 ? "success" : "primary"}
                size="small"
              />
            </BlockStack>
          </Card>
        )}

        {/* Issue list */}
        {(isRunning || allDone) && (
          <Card roundedAbove="sm">
            <BlockStack gap="200">
              {filteredRef.current.map((issue) => {
                const status = statuses[issue.issueId] || "pending";
                return (
                  <div key={issue.issueId}>
                    <InlineStack align="space-between" blockAlign="center" gap="200">
                      <BlockStack gap="050">
                        <Text as="span" variant="bodySm" fontWeight="semibold">
                          {issue.productTitle}
                        </Text>
                        <Text as="span" variant="bodySm" tone="subdued">
                          {issue.issueLabel}
                        </Text>
                      </BlockStack>
                      <div style={{ minWidth: 70, textAlign: "right" }}>
                        {status === "pending" && (
                          <Text as="span" variant="bodySm" tone="subdued">Waiting</Text>
                        )}
                        {status === "fixing" && (
                          <InlineStack gap="100" blockAlign="center">
                            <Spinner size="small" />
                          </InlineStack>
                        )}
                        {status === "done" && (
                          <Badge tone="success" size="small">Done</Badge>
                        )}
                        {status === "failed" && (
                          <Badge tone="critical" size="small">Failed</Badge>
                        )}
                      </div>
                    </InlineStack>
                    <Divider />
                  </div>
                );
              })}
            </BlockStack>
          </Card>
        )}

        <div style={{ height: "1rem" }} />
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return <AppError error={useRouteError()} />;
}
