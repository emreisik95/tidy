import { describe, it, expect } from "vitest";
import { scoreProduct } from "./scoring.server";
import type { ScannedProduct } from "../lib/types";

const perfectProduct: ScannedProduct = {
  id: "gid://shopify/Product/1",
  title: "Organic Cotton T-Shirt - Navy Blue",
  description:
    "Premium organic cotton t-shirt in navy blue. Soft, breathable fabric perfect for everyday wear.",
  descriptionHtml:
    "<p>Premium organic cotton t-shirt in navy blue. Soft, breathable fabric perfect for everyday wear.</p>",
  images: [
    {
      id: "gid://shopify/MediaImage/1",
      altText: "Navy blue organic cotton t-shirt front view",
      url: "https://cdn.shopify.com/1.jpg",
    },
  ],
  seo: {
    title: "Organic Cotton T-Shirt Navy Blue | BrandName",
    description:
      "Shop our premium organic cotton t-shirt in navy blue. Soft, breathable, and sustainably made.",
  },
  category: "gid://shopify/TaxonomyCategory/aa-1",
  productType: "T-Shirts",
  tags: ["cotton", "organic", "navy"],
  vendor: "BrandName",
  variants: [
    { id: "gid://shopify/ProductVariant/1", barcode: "1234567890123" },
  ],
};

const emptyProduct: ScannedProduct = {
  id: "gid://shopify/Product/2",
  title: "",
  description: "",
  descriptionHtml: "",
  images: [],
  seo: { title: null, description: null },
  category: null,
  productType: "",
  tags: [],
  vendor: "",
  variants: [{ id: "gid://shopify/ProductVariant/2", barcode: null }],
};

describe("scoreProduct", () => {
  it("gives 100 to a perfect product", () => {
    const result = scoreProduct(perfectProduct);
    expect(result.score).toBe(100);
    expect(result.issues).toHaveLength(0);
  });

  it("scores a completely empty product very low", () => {
    const result = scoreProduct(emptyProduct);
    // Earns 15 from missing_alt_text (no images = no alt text needed)
    expect(result.score).toBe(15);
    expect(result.issues.length).toBeGreaterThan(5);
  });

  it("flags missing alt text as critical", () => {
    const product = {
      ...perfectProduct,
      images: [
        { id: "1", altText: null, url: "https://cdn.shopify.com/1.jpg" },
      ],
    };
    const result = scoreProduct(product);
    const altIssue = result.issues.find((i) => i.type === "missing_alt_text");
    expect(altIssue).toBeDefined();
    expect(altIssue!.severity).toBe("critical");
    expect(altIssue!.aiFixable).toBe(true);
  });

  it("flags missing SEO title as warning", () => {
    const product = {
      ...perfectProduct,
      seo: { title: null, description: perfectProduct.seo.description },
    };
    const result = scoreProduct(product);
    const seoIssue = result.issues.find(
      (i) => i.type === "missing_seo_title",
    );
    expect(seoIssue).toBeDefined();
    expect(seoIssue!.severity).toBe("warning");
  });

  it("flags short description as warning", () => {
    const product = {
      ...perfectProduct,
      description: "Short.",
      descriptionHtml: "<p>Short.</p>",
    };
    const result = scoreProduct(product);
    const descIssue = result.issues.find(
      (i) => i.type === "short_description",
    );
    expect(descIssue).toBeDefined();
  });

  it("flags no images as critical", () => {
    const product = { ...perfectProduct, images: [] };
    const result = scoreProduct(product);
    const imgIssue = result.issues.find((i) => i.type === "no_images");
    expect(imgIssue).toBeDefined();
    expect(imgIssue!.severity).toBe("critical");
  });

  it("handles product with some but not all images having alt text", () => {
    const product = {
      ...perfectProduct,
      images: [
        { id: "1", altText: "Good alt", url: "https://cdn.shopify.com/1.jpg" },
        { id: "2", altText: null, url: "https://cdn.shopify.com/2.jpg" },
        { id: "3", altText: "", url: "https://cdn.shopify.com/3.jpg" },
      ],
    };
    const result = scoreProduct(product);
    const altIssue = result.issues.find((i) => i.type === "missing_alt_text");
    expect(altIssue).toBeDefined();
    expect(altIssue!.message).toContain("2");
  });

  it("does not flag missing_alt_text when there are no images", () => {
    const product = { ...perfectProduct, images: [] };
    const result = scoreProduct(product);
    const altIssue = result.issues.find((i) => i.type === "missing_alt_text");
    expect(altIssue).toBeUndefined();
  });

  it("flags missing barcode as info", () => {
    const product = {
      ...perfectProduct,
      variants: [{ id: "v1", barcode: null }],
    };
    const result = scoreProduct(product);
    const barcodeIssue = result.issues.find(
      (i) => i.type === "missing_barcode",
    );
    expect(barcodeIssue).toBeDefined();
    expect(barcodeIssue!.severity).toBe("info");
    expect(barcodeIssue!.aiFixable).toBe(false);
  });

  it("returns maxScore of 100", () => {
    const result = scoreProduct(perfectProduct);
    expect(result.maxScore).toBe(100);
  });
});
