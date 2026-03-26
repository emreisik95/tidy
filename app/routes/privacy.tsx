export default function Privacy() {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "3rem 1.5rem", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", color: "#3d3d3d", lineHeight: 1.7 }}>
      <h1 style={{ fontSize: "1.8rem", fontWeight: 700, marginBottom: "0.5rem" }}>Privacy Policy</h1>
      <p style={{ color: "#888", marginBottom: "2rem" }}>Last updated: March 26, 2026</p>

      <p>Tidy ("we", "our", "the app") is a Shopify app that scans product data and generates AI-powered fixes. This policy explains what data we access, how we use it, and how we protect it.</p>

      <h2>What data we access</h2>
      <p>Tidy accesses your Shopify store's product data through the Shopify Admin API. This includes:</p>
      <ul>
        <li>Product titles, descriptions, and images</li>
        <li>Product SEO metadata (titles and descriptions)</li>
        <li>Product categories, types, tags, and vendor information</li>
        <li>Product variant barcodes</li>
        <li>Image alt text</li>
      </ul>

      <h2>What data we store</h2>
      <p>We store the following in our database:</p>
      <ul>
        <li>Your Shopify store domain (for authentication)</li>
        <li>Scan results: product health scores and identified issues</li>
        <li>Your selected content language preference</li>
        <li>Session data required by Shopify for authentication</li>
      </ul>
      <p>We do not store your product images, full descriptions, or any customer data.</p>

      <h2>How we use your data</h2>
      <ul>
        <li>Product data is read to calculate completeness scores and identify missing fields</li>
        <li>When you request an AI fix, product titles and descriptions are sent to OpenAI to generate content</li>
        <li>Product images are sent to OpenAI only when you request alt text generation</li>
        <li>Generated content is shown to you for review before any changes are made to your store</li>
      </ul>

      <h2>Third-party services</h2>
      <p>Tidy uses OpenAI's API to generate product content. When you use the AI fix feature, relevant product data (title, description, product type, and optionally image URLs) is sent to OpenAI for processing. OpenAI's data usage policy applies to this data. We do not send customer data or financial information to any third party.</p>

      <h2>Data retention</h2>
      <p>Scan results are replaced each time you run a new scan. When you uninstall the app, all stored data (scan results, settings, and sessions) is permanently deleted.</p>

      <h2>Data protection</h2>
      <p>All data is transmitted over HTTPS/TLS. Our database is hosted on a private server and is not publicly accessible. Shopify API tokens are stored encrypted and never exposed to the client.</p>

      <h2>Your rights</h2>
      <p>You can request deletion of all your data at any time by uninstalling the app or contacting us. We respond to data requests within 30 days.</p>

      <h2>Contact</h2>
      <p>For privacy questions or data requests: <a href="mailto:tidy@emre.zip" style={{ color: "#c49a3c" }}>tidy@emre.zip</a></p>
    </div>
  );
}
