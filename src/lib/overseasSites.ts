export type OverseasRegion = "us" | "kr" | "cn" | "sea";

export const REGION_LABELS: Record<OverseasRegion, string> = {
  us: "🇺🇸 アメリカ",
  kr: "🇰🇷 韓国",
  cn: "🇨🇳 中国",
  sea: "🌏 東南アジア",
};

export interface OverseasSite {
  id: string;
  region: OverseasRegion;
  name: string;
  color: string;
  buildUrl: (opts: { name: string; jan?: string; asin?: string }) => string;
}

export const OVERSEAS_SITES: OverseasSite[] = [
  // ── アメリカ ──────────────────────────────────────────────
  {
    id: "amazon_us",
    region: "us",
    name: "Amazon.com",
    color: "#FF9900",
    buildUrl: ({ name, asin }) =>
      asin
        ? `https://www.amazon.com/dp/${asin}`
        : `https://www.amazon.com/s?k=${encodeURIComponent(name)}`,
  },
  {
    id: "ebay",
    region: "us",
    name: "eBay",
    color: "#E53238",
    buildUrl: ({ name, jan }) =>
      `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(jan ?? name)}`,
  },
  {
    id: "walmart",
    region: "us",
    name: "Walmart",
    color: "#0071DC",
    buildUrl: ({ name, jan }) =>
      `https://www.walmart.com/search?q=${encodeURIComponent(jan ?? name)}`,
  },

  // ── 韓国 ──────────────────────────────────────────────────
  {
    id: "coupang",
    region: "kr",
    name: "Coupang (쿠팡)",
    color: "#EE2C2C",
    buildUrl: ({ name }) =>
      `https://www.coupang.com/np/search?q=${encodeURIComponent(name)}`,
  },
  {
    id: "naver_shopping",
    region: "kr",
    name: "Naver Shopping",
    color: "#03C75A",
    buildUrl: ({ name, jan }) =>
      `https://search.shopping.naver.com/search/all?query=${encodeURIComponent(jan ?? name)}`,
  },
  {
    id: "gmarket",
    region: "kr",
    name: "G마켓",
    color: "#E8380D",
    buildUrl: ({ name }) =>
      `https://browse.gmarket.co.kr/search?keyword=${encodeURIComponent(name)}`,
  },
  {
    id: "11st",
    region: "kr",
    name: "11번가",
    color: "#FF5500",
    buildUrl: ({ name }) =>
      `https://search.11st.co.kr/Search.tmall?kwd=${encodeURIComponent(name)}`,
  },

  // ── 中国 ──────────────────────────────────────────────────
  {
    id: "taobao",
    region: "cn",
    name: "淘宝 Taobao",
    color: "#FF5000",
    buildUrl: ({ name }) =>
      `https://s.taobao.com/search?q=${encodeURIComponent(name)}`,
  },
  {
    id: "tmall",
    region: "cn",
    name: "天猫 Tmall",
    color: "#FF0036",
    buildUrl: ({ name }) =>
      `https://list.tmall.com/search_product.htm?q=${encodeURIComponent(name)}`,
  },
  {
    id: "jd",
    region: "cn",
    name: "京東 JD.com",
    color: "#E1251B",
    buildUrl: ({ name, jan }) =>
      `https://search.jd.com/Search?keyword=${encodeURIComponent(jan ?? name)}`,
  },

  // ── 東南アジア ────────────────────────────────────────────
  {
    id: "shopee",
    region: "sea",
    name: "Shopee",
    color: "#EE4D2D",
    buildUrl: ({ name }) =>
      `https://shopee.com/search?keyword=${encodeURIComponent(name)}`,
  },
  {
    id: "lazada",
    region: "sea",
    name: "Lazada",
    color: "#0F146D",
    buildUrl: ({ name }) =>
      `https://www.lazada.com/catalog/?q=${encodeURIComponent(name)}`,
  },
];

export const REGIONS: OverseasRegion[] = ["us", "kr", "cn", "sea"];
