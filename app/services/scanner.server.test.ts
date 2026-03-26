import { describe, it, expect, vi } from "vitest";

vi.mock("~/db.server", () => ({ default: {} }));

import { parseJsonl } from "./scanner.server";

describe("parseJsonl", () => {
  it("parses products with nested media and variants", () => {
    const jsonl = [
      '{"id":"gid://shopify/Product/1","title":"Test Product","description":"A test product description that is long enough","descriptionHtml":"<p>A test</p>","productType":"Shoes","vendor":"Nike","tags":["sport"],"seo":{"title":"Test","description":"A test product"},"category":{"id":"gid://shopify/TaxonomyCategory/1"}}',
      '{"id":"gid://shopify/MediaImage/1","alt":"Front view","image":{"url":"https://cdn.shopify.com/1.jpg"},"__parentId":"gid://shopify/Product/1"}',
      '{"id":"gid://shopify/ProductVariant/1","barcode":"123456","__parentId":"gid://shopify/Product/1"}',
    ].join("\n");

    const products = parseJsonl(jsonl);
    expect(products).toHaveLength(1);
    expect(products[0].title).toBe("Test Product");
    expect(products[0].images).toHaveLength(1);
    expect(products[0].images[0].altText).toBe("Front view");
    expect(products[0].variants).toHaveLength(1);
    expect(products[0].variants[0].barcode).toBe("123456");
    expect(products[0].category).toBe("gid://shopify/TaxonomyCategory/1");
  });

  it("handles empty input", () => {
    expect(parseJsonl("")).toEqual([]);
  });

  it("handles products with no children", () => {
    const jsonl =
      '{"id":"gid://shopify/Product/1","title":"Solo","description":"","descriptionHtml":"","productType":"","vendor":"","tags":[],"seo":{}}';
    const products = parseJsonl(jsonl);
    expect(products).toHaveLength(1);
    expect(products[0].images).toEqual([]);
    expect(products[0].variants).toEqual([]);
  });

  it("handles multiple products with interleaved children", () => {
    const jsonl = [
      '{"id":"gid://shopify/Product/1","title":"Product A","description":"","descriptionHtml":"","productType":"","vendor":"","tags":[],"seo":{}}',
      '{"id":"gid://shopify/Product/2","title":"Product B","description":"","descriptionHtml":"","productType":"","vendor":"","tags":[],"seo":{}}',
      '{"id":"gid://shopify/MediaImage/10","alt":"img A","image":{"url":"https://a.jpg"},"__parentId":"gid://shopify/Product/1"}',
      '{"id":"gid://shopify/MediaImage/20","alt":"img B","image":{"url":"https://b.jpg"},"__parentId":"gid://shopify/Product/2"}',
      '{"id":"gid://shopify/ProductVariant/10","barcode":"111","__parentId":"gid://shopify/Product/1"}',
      '{"id":"gid://shopify/ProductVariant/20","barcode":"222","__parentId":"gid://shopify/Product/2"}',
    ].join("\n");

    const products = parseJsonl(jsonl);
    expect(products).toHaveLength(2);
    expect(products[0].images[0].altText).toBe("img A");
    expect(products[1].images[0].altText).toBe("img B");
    expect(products[0].variants[0].barcode).toBe("111");
    expect(products[1].variants[0].barcode).toBe("222");
  });

  it("ignores orphaned child records", () => {
    const jsonl = [
      '{"id":"gid://shopify/Product/1","title":"Only","description":"","descriptionHtml":"","productType":"","vendor":"","tags":[],"seo":{}}',
      '{"id":"gid://shopify/MediaImage/99","alt":"orphan","image":{"url":"https://x.jpg"},"__parentId":"gid://shopify/Product/999"}',
    ].join("\n");

    const products = parseJsonl(jsonl);
    expect(products).toHaveLength(1);
    expect(products[0].images).toEqual([]);
  });
});
