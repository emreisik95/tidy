export default function Changelog() {
  const entries = [
    {
      version: "1.0.0",
      date: "March 26, 2026",
      changes: [
        "Initial release",
        "Product data scanner with 11 health checks",
        "Per-product health scoring (0-100)",
        "AI-powered fixes for descriptions, SEO metadata, alt text, and tags",
        "Fix preview before applying changes",
        "Fix All page with real-time progress",
        "28 language support for AI content generation",
        "Category suggestions using Shopify Standard Product Taxonomy",
        "Automatic product rescan after fixes",
        "Free, Basic ($4.99/mo), and AI ($9.99/mo) plans",
      ],
    },
  ];

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: "#3d3d3d", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "2rem" }}>Changelog</h1>

      {entries.map((entry) => (
        <div key={entry.version} style={{ marginBottom: "2.5rem" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <span style={{ fontSize: "1.2rem", fontWeight: 700 }}>v{entry.version}</span>
            <span style={{ color: "#888", fontSize: "0.9rem" }}>{entry.date}</span>
          </div>
          <ul style={{ paddingLeft: "1.2rem", color: "#555" }}>
            {entry.changes.map((change, i) => (
              <li key={i} style={{ marginBottom: "0.3rem" }}>{change}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
