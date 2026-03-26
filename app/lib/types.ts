export interface ScannedProduct {
  id: string;
  title: string;
  description: string;
  descriptionHtml: string;
  images: Array<{
    id: string;
    altText: string | null;
    url: string;
  }>;
  seo: {
    title: string | null;
    description: string | null;
  };
  category: string | null;
  productType: string;
  tags: string[];
  vendor: string;
  variants: Array<{
    id: string;
    barcode: string | null;
  }>;
}

export interface ScoringResult {
  score: number;
  maxScore: number;
  issues: Array<{
    type: string;
    severity: "critical" | "warning" | "info";
    field: string;
    message: string;
    aiFixable: boolean;
  }>;
}
