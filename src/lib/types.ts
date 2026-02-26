export type Mall =
  | "amazon"
  | "rakuten"
  | "yahoo"
  | "biccamera"
  | "yodobashi"
  | "aupay";

export const MALL_LABELS: Record<Mall, string> = {
  amazon: "Amazon",
  rakuten: "楽天市場",
  yahoo: "Yahoo!ショッピング",
  biccamera: "ビックカメラ",
  yodobashi: "ヨドバシ",
  aupay: "au PAYマーケット",
};

export const MALL_COLORS: Record<Mall, string> = {
  amazon: "#FF9900",
  rakuten: "#BF0000",
  yahoo: "#FF0033",
  biccamera: "#003399",
  yodobashi: "#FF6600",
  aupay: "#EA0029",
};

export interface MallPrice {
  mall: Mall;
  price: number | null;
  url: string;
  availability: "available" | "unavailable" | "unknown";
  shipping?: number;
}

export interface ProductResult {
  jan?: string;
  asin?: string;
  name: string;
  imageUrl?: string;
  amazonPrice: number | null;
  prices: MallPrice[];
}

export interface SearchQuery {
  query: string;
  type: "jan" | "asin" | "name";
}

export interface HighlightConfig {
  thresholdPercent: number;
}
