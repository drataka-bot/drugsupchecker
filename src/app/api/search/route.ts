import { NextRequest, NextResponse } from "next/server";
import { ProductResult, MallPrice } from "@/lib/types";

interface RakutenItem {
  Item: {
    itemName: string;
    itemPrice: number;
    itemUrl: string;
    mediumImageUrls: { imageUrl: string }[];
  };
}

interface YahooHit {
  name: string;
  price: number;
  url: string;
  image?: { small?: string; medium?: string };
  janCode?: string;
  inStock?: boolean;
  shipping?: { code?: number };
}

interface YahooResult {
  items: ProductResult[];
  total: number;
  shown: number;
}

interface KeepaResult {
  price: number | null;
  availability: "available" | "unavailable" | "unknown";
  asin: string | null;
  jan: string | null;
  url: string | null;
  name: string | null;
  imageUrl: string | null;
}

const KEEPA_NULL: KeepaResult = { price: null, availability: "unknown", asin: null, jan: null, url: null, name: null, imageUrl: null };
const FETCH_TIMEOUT = 4000;  // Keepaは2回呼ぶので1回4秒→合計8秒でVercel10秒制限内に収める

// ─────────────────────────────────────────────────────────────────
// ユーティリティ
// ─────────────────────────────────────────────────────────────────

function isValidKey(key: string | undefined): key is string {
  if (!key || key.length < 4) return false;
  if (/[\u3000-\u9fff\s]/.test(key)) return false;
  return true;
}

function parseKeepaPrice(v: number | null | undefined): number | null {
  if (!v || v <= 0) return null;
  return Math.round(v / 100);
}

function priceFromStats(current: number[] | null | undefined): number | null {
  if (!current) return null;
  for (const idx of [0, 7, 1]) {
    const p = parseKeepaPrice(current[idx]);
    if (p !== null) return p;
  }
  return null;
}

function priceFromCsv(csv: (number[] | null)[] | null | undefined): number | null {
  if (!csv) return null;
  for (const idx of [0, 7, 1]) {
    const arr = csv[idx];
    if (!arr || arr.length < 2) continue;
    const p = parseKeepaPrice(arr[arr.length - 1]);
    if (p !== null) return p;
  }
  return null;
}

function isUsedItem(name: string): boolean {
  return /中古|ユーズド|used|USED|junk|ジャンク|訳あり|難あり|傷あり/i.test(name);
}

function cheapest(items: ProductResult[]): ProductResult | null {
  if (items.length === 0) return null;
  return items.reduce((a, b) =>
    (a.prices[0]?.price ?? Infinity) <= (b.prices[0]?.price ?? Infinity) ? a : b
  );
}

// ─────────────────────────────────────────────────────────────────
// Yahoo Shopping ページスクレイプ (APIキー不要)
// ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findHitsArray(obj: any, depth = 0): any[] {
  if (depth > 8 || !obj || typeof obj !== "object") return [];
  if (Array.isArray(obj) && obj.length > 0 && typeof obj[0]?.name === "string") return obj;
  for (const key of ["hits", "items", "products", "result", "searchResult"]) {
    if (Array.isArray(obj[key]) && obj[key].length > 0) return obj[key];
  }
  for (const val of Object.values(obj)) {
    const found = findHitsArray(val, depth + 1);
    if (found.length > 0) return found;
  }
  return [];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseScrapedHit(h: any): ProductResult | null {
  const name = h?.name || h?.title;
  const price = h?.price || h?.priceMin || h?.lowestPrice;
  const url = h?.url || h?.externalUrl || h?.itemUrl;
  if (!name || !price || !url) return null;
  return {
    name: String(name),
    jan: h?.janCode || h?.jan_code || h?.jan || undefined,
    imageUrl: h?.image?.medium || h?.image?.small || h?.imageUrl || h?.thumbnailUrl || undefined,
    amazonPrice: null,
    prices: [{ mall: "yahoo" as const, price: Number(price), url: String(url), availability: "available" as const }],
  };
}

async function scrapeYahooShopping(query: string): Promise<ProductResult[]> {
  try {
    const url = `https://shopping.yahoo.co.jp/search?p=${encodeURIComponent(query)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "ja-JP,ja;q=0.9,en;q=0.8",
      },
    });
    clearTimeout(t);
    if (!res.ok) return [];

    const html = await res.text();

    // __NEXT_DATA__ から商品配列を探す
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (m) {
      try {
        const hits = findHitsArray(JSON.parse(m[1]));
        const products = hits.slice(0, 20).map(parseScrapedHit).filter(Boolean) as ProductResult[];
        if (products.length > 0) return products;
      } catch { /* skip */ }
    }

    // JSON-LD structured data
    const ldMatches = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    for (const ldm of ldMatches) {
      try {
        const ld = JSON.parse(ldm[1]);
        const list = ld?.itemListElement ?? ld?.offers ?? [];
        if (Array.isArray(list) && list.length > 0) {
          const products = list.slice(0, 20).map((item: Record<string, unknown>) => {
            const listing = (item.item ?? item) as Record<string, unknown>;
            const offer = (listing.offers ?? listing) as Record<string, unknown>;
            const name = listing.name ?? item.name;
            const price = offer.price ?? offer.lowPrice;
            const url = listing.url ?? item.url;
            if (!name || !price || !url) return null;
            return {
              name: String(name),
              imageUrl: String(listing.image ?? ""),
              amazonPrice: null,
              prices: [{ mall: "yahoo" as const, price: Number(price), url: String(url), availability: "available" as const }],
            } as ProductResult;
          }).filter(Boolean) as ProductResult[];
          if (products.length > 0) return products;
        }
      } catch { /* skip */ }
    }

    return [];
  } catch (e) {
    console.error("[Yahoo Scrape] error:", e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────
// Yahoo! ショッピング API
// ─────────────────────────────────────────────────────────────────

async function searchYahoo(query: string, page: number, inStock = true): Promise<YahooResult> {
  const appId = process.env.YAHOO_APP_ID;
  if (!isValidKey(appId)) return { items: [], total: 0, shown: 0 };

  const hitsPerPage = 30;
  const start = (page - 1) * hitsPerPage + 1;

  try {
    const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
    url.searchParams.set("appid", appId);
    url.searchParams.set("query", query);
    url.searchParams.set("hits", String(hitsPerPage));
    url.searchParams.set("start", String(start));
    url.searchParams.set("sort", "+price");
    if (inStock) url.searchParams.set("in_stock", "1");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) {
      console.error("[Yahoo] error:", res.status, await res.text());
      return { items: [], total: 0, shown: 0 };
    }
    const data = await res.json();
    const hits: YahooHit[] = (data.hits || []).filter((h: YahooHit) => !isUsedItem(h.name));

    return {
      items: hits.map((h) => ({
        name: h.name,
        jan: h.janCode,
        imageUrl: h.image?.medium || h.image?.small,
        amazonPrice: null,
        prices: [{
          mall: "yahoo" as const,
          price: h.price,
          url: h.url,
          availability: h.inStock ? ("available" as const) : ("unavailable" as const),
          shipping: h.shipping?.code === 0 ? 0 : undefined,
        }],
      })),
      total: data.totalResultsAvailable ?? hits.length,
      shown: hits.length,
    };
  } catch (e) {
    console.error("[Yahoo] fetch failed:", e);
    return { items: [], total: 0, shown: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────
// 楽天市場 API (任意)
// ─────────────────────────────────────────────────────────────────

async function searchRakuten(keyword: string, page: number, hitsPerPage: number, siteUrl: string): Promise<{ items: ProductResult[]; total: number; pageCount: number }> {
  const appId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!isValidKey(appId) || !isValidKey(accessKey)) return { items: [], total: 0, pageCount: 0 };

  try {
    const url = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601");
    url.searchParams.set("applicationId", appId);
    url.searchParams.set("accessKey", accessKey);
    url.searchParams.set("keyword", keyword);
    url.searchParams.set("hits", String(hitsPerPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("format", "json");
    url.searchParams.set("sort", "+itemPrice");

    const res = await fetch(url.toString(), {
      headers: { Referer: siteUrl, Origin: siteUrl },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) {
      console.error("[Rakuten] error:", res.status);
      return { items: [], total: 0, pageCount: 0 };
    }
    const data = await res.json();
    const items: ProductResult[] = (data.Items || [])
      .filter((item: RakutenItem) => !isUsedItem(item.Item.itemName))
      .map((item: RakutenItem) => ({
        name: item.Item.itemName,
        jan: keyword,
        imageUrl: item.Item.mediumImageUrls?.[0]?.imageUrl,
        amazonPrice: null,
        prices: [{ mall: "rakuten" as const, price: item.Item.itemPrice, url: item.Item.itemUrl, availability: "available" as const }],
      }));
    const total: number = data.count ?? items.length;
    const pageCount: number = data.pageCount ?? Math.ceil(total / hitsPerPage);
    return { items, total, pageCount };
  } catch (e) {
    console.error("[Rakuten] fetch failed:", e);
    return { items: [], total: 0, pageCount: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────
// Keepa: 商品名 → 複数商品リスト (discover mode 用)
// ─────────────────────────────────────────────────────────────────

async function searchKeepaByTermMultiple(term: string): Promise<{ products: ProductResult[]; totalFound: number }> {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!isValidKey(apiKey)) return { products: [], totalFound: 0 };

  try {
    const searchUrl = new URL("https://api.keepa.com/search");
    searchUrl.searchParams.set("key", apiKey);
    searchUrl.searchParams.set("domain", "5");
    searchUrl.searchParams.set("type", "product");
    searchUrl.searchParams.set("term", term);

    const searchRes = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!searchRes.ok) {
      console.error("[Keepa/search] error:", searchRes.status);
      return { products: [], totalFound: 0 };
    }
    const searchData = await searchRes.json();
    const asinList: string[] = searchData.searchResult?.asinList ?? [];
    if (asinList.length === 0) return { products: [], totalFound: 0 };

    const topAsins = asinList.slice(0, 10).join(","); // 10件に絞って高速化

    const prodUrl = new URL("https://api.keepa.com/product");
    prodUrl.searchParams.set("key", apiKey);
    prodUrl.searchParams.set("domain", "5");
    prodUrl.searchParams.set("stats", "180");
    prodUrl.searchParams.set("asin", topAsins);

    const prodRes = await fetch(prodUrl.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!prodRes.ok) {
      console.error("[Keepa/product] error:", prodRes.status);
      return { products: [], totalFound: asinList.length };
    }
    const prodData = await prodRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products: any[] = prodData.products ?? [];

    console.log("[Keepa/search]", `"${term}"`, "→", products.length, "products (total:", asinList.length, ")");

    const mapped = products.map((p) => {
      const eanSingle = typeof p.ean === "string" && /^\d{8,13}$/.test(p.ean) ? p.ean : undefined;
      const eanFromList = !eanSingle && Array.isArray(p.eanList)
        ? (p.eanList as string[]).find((e) => typeof e === "string" && /^\d{8,13}$/.test(e))
        : undefined;
      return {
        name: (p.title as string) || (p.asin as string),
        asin: p.asin as string,
        jan: eanSingle ?? eanFromList,
        imageUrl: p.imagesCSV
          ? `https://images-na.ssl-images-amazon.com/images/I/${(p.imagesCSV as string).split(",")[0]}`
          : undefined,
        amazonPrice: priceFromStats(p.stats?.current) ?? priceFromCsv(p.csv),
        prices: [],
      };
    });
    return { products: mapped, totalFound: asinList.length };
  } catch (e) {
    console.error("[Keepa/search/multi] error:", e);
    return { products: [], totalFound: 0 };
  }
}

// ─────────────────────────────────────────────────────────────────
// Keepa: JAN/ASIN → 価格+商品情報 (compare mode 用)
// ─────────────────────────────────────────────────────────────────

async function searchKeepa(identifier: string, type: "jan" | "asin"): Promise<KeepaResult> {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!isValidKey(apiKey)) return KEEPA_NULL;

  try {
    const url = new URL("https://api.keepa.com/product");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("domain", "5");
    url.searchParams.set("stats", "180");

    if (type === "asin") {
      url.searchParams.set("asin", identifier);
    } else {
      url.searchParams.set("code", identifier);
    }

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    if (!res.ok) {
      console.error("[Keepa] error:", res.status, await res.text());
      return KEEPA_NULL;
    }

    const data = await res.json();
    const product = data.products?.[0];
    if (!product) {
      console.warn("[Keepa] no product:", identifier, "tokensLeft:", data.tokensLeft);
      return KEEPA_NULL;
    }

    const asin = product.asin as string;
    const name: string | null = product.title ?? null;
    const imageUrl: string | null = product.imagesCSV
      ? `https://images-na.ssl-images-amazon.com/images/I/${product.imagesCSV.split(",")[0]}`
      : null;

    const statsCurrent = product.stats?.current as number[] | null | undefined;
    const priceFromSt = priceFromStats(statsCurrent);
    const priceFromCv = priceFromCsv(product.csv as (number[] | null)[] | null | undefined);
    const buyBoxRaw = product.stats?.buyBoxPrice as number | null | undefined;
    const buyBoxPrice = parseKeepaPrice(buyBoxRaw);
    const currentPrice = priceFromSt ?? buyBoxPrice ?? priceFromCv;

    console.log("[Keepa]", asin, "→ price:", currentPrice);

    const eanSingle = typeof product.ean === "string" && /^\d{8,13}$/.test(product.ean) ? product.ean : null;
    const eanFromList = !eanSingle && Array.isArray(product.eanList)
      ? ((product.eanList as string[]).find((e) => typeof e === "string" && /^\d{8,13}$/.test(e)) ?? null)
      : null;
    const jan = eanSingle ?? eanFromList;

    return {
      price: currentPrice,
      availability: currentPrice !== null ? "available" : "unknown",
      asin,
      jan,
      url: `https://www.amazon.co.jp/dp/${asin}`,
      name,
      imageUrl,
    };
  } catch (e) {
    console.error("[Keepa] fetch failed:", e);
    return KEEPA_NULL;
  }
}

// ─────────────────────────────────────────────────────────────────
// GET /api/search
// ─────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const type = searchParams.get("type");
  const page = Math.max(1, Number(searchParams.get("page") || "1"));

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const hitsPerPage = 30;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://drugsupchecker.vercel.app";

  try {
    // ═══════════════════════════════════════════════════════════
    // discover モード: 商品名検索 → JAN/ASIN を含む商品リスト
    // ═══════════════════════════════════════════════════════════
    if (type === "name") {
      // Yahoo API・Yahoo scrape・Keepa search を全部同時実行（タイムアウト積み重ね防止）
      const [yahooApi, scraped, keepaResult] = await Promise.all([
        searchYahoo(query, page, false),
        scrapeYahooShopping(query),
        searchKeepaByTermMultiple(query),
      ]);
      console.log("[discover]", { query, keepa: keepaResult.products.length, yahoo: yahooApi.items.length, scrape: scraped.length });

      // 優先度: Keepa(Amazon) > Yahoo API > Yahoo Scrape
      if (keepaResult.products.length > 0) {
        return NextResponse.json({
          results: keepaResult.products,
          meta: {
            mode: "discover",
            source: "amazon",
            totalHits: keepaResult.totalFound,
            totalShown: keepaResult.products.length,
            sort: "Amazonの関連度順",
            janCount: keepaResult.products.filter((p) => p.jan).length,
            rakuten: { total: 0, shown: 0, hasMore: false },
            yahoo: { total: 0, shown: 0, hasMore: false },
            page: 1,
            hasMore: false,
          },
        });
      }

      if (yahooApi.items.length > 0) {
        const yahooPageCount = Math.ceil(yahooApi.total / hitsPerPage);
        const sorted = [...yahooApi.items].sort(
          (a, b) => (a.prices[0]?.price ?? Infinity) - (b.prices[0]?.price ?? Infinity)
        );
        return NextResponse.json({
          results: sorted,
          meta: {
            mode: "discover",
            source: "yahoo",
            totalHits: yahooApi.total,
            totalShown: sorted.length,
            sort: "価格の安い順",
            janCount: sorted.filter((p) => p.jan).length,
            rakuten: { total: 0, shown: 0, hasMore: false },
            yahoo: { total: yahooApi.total, shown: sorted.length, hasMore: page < yahooPageCount },
            page,
            hasMore: page < yahooPageCount,
          },
        });
      }

      if (scraped.length > 0) {
        return NextResponse.json({
          results: scraped,
          meta: {
            mode: "discover",
            source: "yahoo_scrape",
            totalHits: scraped.length,
            totalShown: scraped.length,
            sort: null,
            janCount: scraped.filter((p) => p.jan).length,
            rakuten: { total: 0, shown: 0, hasMore: false },
            yahoo: { total: scraped.length, shown: scraped.length, hasMore: false },
            page: 1,
            hasMore: false,
          },
        });
      }

      return NextResponse.json({
        results: [],
        meta: {
          mode: "discover",
          source: "none",
          totalHits: 0,
          totalShown: 0,
          sort: null,
          janCount: 0,
          rakuten: { total: 0, shown: 0, hasMore: false },
          yahoo: { total: 0, shown: 0, hasMore: false },
          page: 1,
          hasMore: false,
          debug: {
            keepa: keepaResult.products.length,
            yahoo: yahooApi.items.length,
            scrape: scraped.length,
            keepaKey: !!process.env.KEEPA_API_KEY,
          },
        },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // keyword モード: 商品名 → JAN取得 → JANで比較
    // ═══════════════════════════════════════════════════════════
    if (type === "keyword") {
      // JAN取得: Keepa・Yahoo・Scrapeを並列実行
      const [keepaTry, yahooForJan, scrapedForJan] = await Promise.all([
        searchKeepaByTermMultiple(query),
        searchYahoo(query, 1),
        scrapeYahooShopping(query),
      ]);
      const resolvedJan =
        keepaTry.products.find((p) => p.jan)?.jan ??
        yahooForJan.items.find((i) => i.jan)?.jan ??
        scrapedForJan.find((p) => p.jan)?.jan ??
        null;

      if (!resolvedJan) {
        return NextResponse.json({
          results: [],
          meta: { mode: "compare", rakuten: { total: 0, shown: 0, hasMore: false }, yahoo: { total: 0, shown: 0, hasMore: false }, page: 1, hasMore: false },
        });
      }

      const [rkResult, yhResults, keepaResult, scrapeForPrice] = await Promise.all([
        searchRakuten(resolvedJan, 1, 30, siteUrl),
        searchYahoo(resolvedJan, 1),
        searchKeepa(resolvedJan, "jan"),
        scrapeYahooShopping(resolvedJan),
      ]);

      const bestRk = cheapest(rkResult.items);
      const bestYh = cheapest(yhResults.items) ?? cheapest(scrapeForPrice);
      const amazonPrice: MallPrice | null = keepaResult.asin
        ? { mall: "amazon" as const, price: keepaResult.price, url: keepaResult.url!, availability: keepaResult.availability }
        : null;

      const scrapedYahooPrice: MallPrice | null = null;

      const prices: MallPrice[] = [
        ...(amazonPrice ? [amazonPrice] : []),
        ...(bestRk ? bestRk.prices : []),
        ...(bestYh ? bestYh.prices : []),
        ...(scrapedYahooPrice ? [scrapedYahooPrice] : []),
      ];

      return NextResponse.json({
        results: prices.length > 0 ? [{
          name: keepaResult.name ?? bestRk?.name ?? bestYh?.name ?? query,
          jan: resolvedJan,
          asin: keepaResult.asin ?? undefined,
          imageUrl: keepaResult.imageUrl ?? bestRk?.imageUrl ?? bestYh?.imageUrl,
          amazonPrice: keepaResult.price,
          prices,
        }] : [],
        meta: { mode: "compare", rakuten: { total: rkResult.total, shown: rkResult.items.length, hasMore: false }, yahoo: { total: yhResults.total, shown: yhResults.shown, hasMore: false }, page: 1, hasMore: false },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // ASIN比較
    // ═══════════════════════════════════════════════════════════
    if (type === "asin") {
      const keepaResult = await searchKeepa(query, "asin");

      let resolvedJan = keepaResult.jan;
      if (!resolvedJan && keepaResult.name) {
        const yahooForJan = await searchYahoo(keepaResult.name, 1);
        resolvedJan = yahooForJan.items.find((i) => i.jan)?.jan ?? null;
      }

      const amazonMall: MallPrice = {
        mall: "amazon" as const,
        price: keepaResult.price,
        url: keepaResult.url ?? `https://www.amazon.co.jp/dp/${query}`,
        availability: keepaResult.asin ? keepaResult.availability : "unknown",
      };

      if (resolvedJan) {
        // 楽天・Yahoo API・Yahooスクレイプを並列実行
        const [janRkResult, janYhResults, janScraped] = await Promise.all([
          searchRakuten(resolvedJan, page, hitsPerPage, siteUrl),
          searchYahoo(resolvedJan, page),
          scrapeYahooShopping(resolvedJan),
        ]);

        const bestJanRk = cheapest(janRkResult.items);
        const bestJanYh = cheapest(janYhResults.items) ?? cheapest(janScraped);

        return NextResponse.json({
          results: [{
            name: keepaResult.name ?? query,
            asin: keepaResult.asin ?? query,
            jan: resolvedJan,
            imageUrl: keepaResult.imageUrl ?? bestJanRk?.imageUrl ?? bestJanYh?.imageUrl,
            amazonPrice: keepaResult.price,
            prices: [
              amazonMall,
              ...(bestJanRk ? bestJanRk.prices : []),
              ...(bestJanYh ? bestJanYh.prices : []),
            ],
          }],
          meta: { mode: "compare", rakuten: { total: janRkResult.total, shown: janRkResult.items.length, hasMore: false }, yahoo: { total: janYhResults.total, shown: janYhResults.shown, hasMore: false }, page: 1, hasMore: false },
        });
      }

      // JAN不明 → Amazon価格のみ
      return NextResponse.json({
        results: [{
          name: keepaResult.name ?? query,
          asin: keepaResult.asin ?? query,
          imageUrl: keepaResult.imageUrl ?? undefined,
          amazonPrice: keepaResult.price,
          prices: [amazonMall],
        }],
        meta: { mode: "compare", rakuten: { total: 0, shown: 0, hasMore: false }, yahoo: { total: 0, shown: 0, hasMore: false }, page: 1, hasMore: false },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // JAN比較: 楽天+Yahoo+Keepa 並列
    // ═══════════════════════════════════════════════════════════
    const [rkResult, yahooResults, keepaResult, scrapedYahoo] = await Promise.all([
      searchRakuten(query, page, hitsPerPage, siteUrl),
      searchYahoo(query, page),
      searchKeepa(query, "jan"),
      scrapeYahooShopping(query),
    ]);

    const bestRakuten = cheapest(rkResult.items);
    const bestYahoo = cheapest(yahooResults.items) ?? cheapest(scrapedYahoo);

    const amazonMallPrice: MallPrice | null = keepaResult.asin
      ? {
          mall: "amazon" as const,
          price: keepaResult.price,
          url: keepaResult.url ?? `https://www.amazon.co.jp/dp/${keepaResult.asin}`,
          availability: keepaResult.availability,
        }
      : null;

    const prices: MallPrice[] = [
      ...(amazonMallPrice ? [amazonMallPrice] : []),
      ...(bestRakuten ? bestRakuten.prices : []),
      ...(bestYahoo ? bestYahoo.prices : []),
    ];

    const merged: ProductResult | null = prices.length > 0
      ? {
          name: keepaResult.name ?? bestRakuten?.name ?? bestYahoo?.name ?? query,
          jan: query,
          asin: keepaResult.asin ?? undefined,
          imageUrl: keepaResult.imageUrl ?? bestRakuten?.imageUrl ?? bestYahoo?.imageUrl,
          amazonPrice: keepaResult.price,
          prices,
        }
      : null;

    return NextResponse.json({
      results: merged ? [merged] : [],
      meta: {
        mode: "compare",
        rakuten: { total: rkResult.total, shown: rkResult.items.length, hasMore: page < rkResult.pageCount },
        yahoo: { total: yahooResults.total, shown: yahooResults.shown, hasMore: false },
        page: 1,
        hasMore: false,
      },
    });
  } catch (e) {
    console.error("[Search] unexpected error:", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
