import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const { i18n, close, data, navigation } = shopify;
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const productId = data.selected[0]?.id;

  useEffect(() => {
    if (!productId) return;

    (async () => {
      const res = await fetch("shopify:admin/api/graphql.json", {
        method: "POST",
        body: JSON.stringify({
          query: `query Product($id: ID!) {
            product(id: $id) {
              title
              description
              seo { title description }
              category { id }
              tags
              media(first: 10) {
                edges {
                  node {
                    ... on MediaImage {
                      alt
                    }
                  }
                }
              }
            }
          }`,
          variables: { id: productId },
        }),
      });

      if (!res.ok) {
        setLoading(false);
        return;
      }

      const { data: productData } = await res.json();
      const p = productData.product;
      const found = [];

      // Check for missing fields
      const images = p.media?.edges || [];
      const missingAlt = images.filter(
        (e) => e.node && !e.node.alt?.trim(),
      );
      if (missingAlt.length > 0) {
        found.push({
          key: "missingAltText",
          severity: "critical",
          detail: `${missingAlt.length} image(s)`,
        });
      }

      if (!p.seo?.title?.trim()) {
        found.push({ key: "missingSeoTitle", severity: "warning" });
      }

      if (!p.seo?.description?.trim()) {
        found.push({ key: "missingSeoDescription", severity: "warning" });
      }

      if (!p.description?.trim() || p.description.trim().length < 50) {
        found.push({ key: "missingDescription", severity: "warning" });
      }

      if (!p.category?.id) {
        found.push({ key: "missingCategory", severity: "warning" });
      }

      if (!p.tags || p.tags.length === 0) {
        found.push({ key: "missingTags", severity: "info" });
      }

      setIssues(found);
      setLoading(false);
    })();
  }, [productId]);

  const encodedId = encodeURIComponent(productId || "");

  return (
    <s-admin-action>
      <s-stack direction="block" gap="base">
        {loading ? (
          <s-text>{i18n.translate("checking")}</s-text>
        ) : issues.length === 0 ? (
          <s-stack direction="block" gap="small">
            <s-badge tone="success">OK</s-badge>
            <s-text>{i18n.translate("allGood")}</s-text>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">
            <s-text type="strong">
              {i18n.translate("issuesFound", { count: issues.length })}
            </s-text>
            {issues.map((issue) => (
              <s-stack
                key={issue.key}
                direction="inline"
                gap="small"
                align-items="center"
              >
                <s-badge
                  tone={
                    issue.severity === "critical"
                      ? "critical"
                      : issue.severity === "warning"
                        ? "warning"
                        : "info"
                  }
                >
                  {issue.severity}
                </s-badge>
                <s-text>
                  {i18n.translate(issue.key)}
                  {issue.detail ? ` (${issue.detail})` : ""}
                </s-text>
              </s-stack>
            ))}
          </s-stack>
        )}
      </s-stack>

      {!loading && issues.length > 0 && (
        <s-button
          slot="primary-action"
          onClick={() => {
            navigation.navigate(
              `app:app/products/${encodedId}`,
            );
            close();
          }}
        >
          {i18n.translate("openTidy")}
        </s-button>
      )}
      <s-button
        slot="secondary-actions"
        onClick={() => close()}
      >
        {i18n.translate("close")}
      </s-button>
    </s-admin-action>
  );
}
