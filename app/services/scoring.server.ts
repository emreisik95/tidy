import type { ScannedProduct, ScoringResult } from "../lib/types";

interface Rule {
  type: string;
  field: string;
  weight: number;
  severity: "critical" | "warning" | "info";
  aiFixable: boolean;
  check: (product: ScannedProduct) => string | null;
}

const rules: Rule[] = [
  {
    type: "missing_title",
    field: "title",
    weight: 10,
    severity: "critical",
    aiFixable: false,
    check: (p) => (!p.title.trim() ? "Product has no title" : null),
  },
  {
    type: "missing_description",
    field: "description",
    weight: 15,
    severity: "critical",
    aiFixable: true,
    check: (p) => {
      const text = p.description.trim();
      if (!text) return "Product has no description";
      return null;
    },
  },
  {
    type: "short_description",
    field: "description",
    weight: 0,
    severity: "warning",
    aiFixable: true,
    check: (p) => {
      const text = p.description.trim();
      if (text && text.length < 50)
        return "Description is too short (under 50 characters)";
      return null;
    },
  },
  {
    type: "no_images",
    field: "images",
    weight: 10,
    severity: "critical",
    aiFixable: false,
    check: (p) => (p.images.length === 0 ? "Product has no images" : null),
  },
  {
    type: "missing_alt_text",
    field: "images",
    weight: 15,
    severity: "critical",
    aiFixable: true,
    check: (p) => {
      if (p.images.length === 0) return null;
      const missing = p.images.filter((img) => !img.altText?.trim());
      if (missing.length > 0)
        return `${missing.length} image(s) missing alt text`;
      return null;
    },
  },
  {
    type: "missing_seo_title",
    field: "seo.title",
    weight: 12,
    severity: "warning",
    aiFixable: true,
    check: (p) => (!p.seo.title?.trim() ? "No SEO title set" : null),
  },
  {
    type: "missing_seo_description",
    field: "seo.description",
    weight: 12,
    severity: "warning",
    aiFixable: true,
    check: (p) =>
      !p.seo.description?.trim() ? "No SEO description set" : null,
  },
  {
    type: "short_seo_description",
    field: "seo.description",
    weight: 0,
    severity: "info",
    aiFixable: true,
    check: (p) => {
      const text = p.seo.description?.trim();
      if (text && text.length < 50)
        return "SEO description is too short (under 50 characters)";
      return null;
    },
  },
  {
    type: "missing_category",
    field: "category",
    weight: 8,
    severity: "warning",
    aiFixable: true,
    check: (p) => (!p.category ? "No product category set" : null),
  },
  {
    type: "missing_product_type",
    field: "productType",
    weight: 5,
    severity: "info",
    aiFixable: true,
    check: (p) =>
      !p.productType.trim() ? "No product type set" : null,
  },
  {
    type: "no_tags",
    field: "tags",
    weight: 5,
    severity: "info",
    aiFixable: true,
    check: (p) => (p.tags.length === 0 ? "Product has no tags" : null),
  },
  {
    type: "missing_barcode",
    field: "variants.barcode",
    weight: 5,
    severity: "info",
    aiFixable: false,
    check: (p) => {
      const hasBarcode = p.variants.some((v) => v.barcode?.trim());
      return hasBarcode ? null : "No variant has a barcode/GTIN";
    },
  },
  {
    type: "missing_vendor",
    field: "vendor",
    weight: 3,
    severity: "info",
    aiFixable: false,
    check: (p) => (!p.vendor.trim() ? "No vendor set" : null),
  },
];

export function scoreProduct(product: ScannedProduct): ScoringResult {
  const issues: ScoringResult["issues"] = [];
  let earnedWeight = 0;
  const maxWeight = rules.reduce((sum, r) => sum + r.weight, 0);

  for (const rule of rules) {
    const failureMessage = rule.check(product);
    if (failureMessage) {
      issues.push({
        type: rule.type,
        severity: rule.severity,
        field: rule.field,
        message: failureMessage,
        aiFixable: rule.aiFixable,
      });
    } else {
      earnedWeight += rule.weight;
    }
  }

  const score = maxWeight > 0 ? Math.round((earnedWeight / maxWeight) * 100) : 0;

  return { score, maxScore: 100, issues };
}
