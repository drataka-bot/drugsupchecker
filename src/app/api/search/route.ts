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
      const keepaResult = await searchKeepaByTermMultiple(query);
      console.log("[discover]", { query, keepa: keepaResult.products.length });

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
          debug: { keepa: keepaResult.products.length, keepaKey: !!process.env.KEEPA_API_KEY },
        },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // keyword モード: 商品名 → JAN取得 → JANで比較
    // ═══════════════════════════════════════════════════════════
    if (type === "keyword") {
      // KeepaでJANを取得
      const keepaTry = await searchKeepaByTermMultiple(query);
      const resolvedJan = keepaTry.products.find((p) => p.jan)?.jan ?? null;

      if (!resolvedJan) {
        return NextResponse.json({
          results: [],
          meta: { mode: "compare", rakuten: { total: 0, shown: 0, hasMore: false }, yahoo: { total: 0, shown: 0, hasMore: false }, page: 1, hasMore: false },
        });
      }

      const [rkResult, keepaResult] = await Promise.all([
        searchRakuten(resolvedJan, 1, 30, siteUrl),
        searchKeepa(resolvedJan, "jan"),
      ]);

      const bestRk = cheapest(rkResult.items);
      const amazonPrice: MallPrice | null = keepaResult.asin
        ? { mall: "amazon" as const, price: keepaResult.price, url: keepaResult.url!, availability: keepaResult.availability }
        : null;

      const prices: MallPrice[] = [
        ...(amazonPrice ? [amazonPrice] : []),
        ...(bestRk ? bestRk.prices : []),
      ];

      return NextResponse.json({
        results: prices.length > 0 ? [{
          name: keepaResult.name ?? bestRk?.name ?? query,
          jan: resolvedJan,
          asin: keepaResult.asin ?? undefined,
          imageUrl: keepaResult.imageUrl ?? bestRk?.imageUrl,
          amazonPrice: keepaResult.price,
          prices,
        }] : [],
        meta: { mode: "compare", rakuten: { total: rkResult.total, shown: rkResult.items.length, hasMore: false }, yahoo: { total: 0, shown: 0, hasMore: false }, page: 1, hasMore: false },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // ASIN比較
    // ═══════════════════════════════════════════════════════════
    if (type === "asin") {
      const keepaResult = await searchKeepa(query, "asin");
      const resolvedJan = keepaResult.jan;

      const amazonMall: MallPrice = {
        mall: "amazon" as const,
        price: keepaResult.price,
        url: keepaResult.url ?? `https://www.amazon.co.jp/dp/${query}`,
        availability: keepaResult.asin ? keepaResult.availability : "unknown",
      };

      if (resolvedJan) {
        const janRkResult = await searchRakuten(resolvedJan, page, hitsPerPage, siteUrl);
        const bestJanRk = cheapest(janRkResult.items);

        return NextResponse.json({
          results: [{
            name: keepaResult.name ?? query,
            asin: keepaResult.asin ?? query,
            jan: resolvedJan,
            imageUrl: keepaResult.imageUrl ?? bestJanRk?.imageUrl,
            amazonPrice: keepaResult.price,
            prices: [
              amazonMall,
              ...(bestJanRk ? bestJanRk.prices : []),
            ],
          }],
          meta: { mode: "compare", rakuten: { total: janRkResult.total, shown: janRkResult.items.length, hasMore: false }, yahoo: { total: 0, shown: 0, hasMore: false }, page: 1, hasMore: false },
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
    // JAN比較: 楽天+Keepa 並列
    // ═══════════════════════════════════════════════════════════
    const [rkResult, keepaResult] = await Promise.all([
      searchRakuten(query, page, hitsPerPage, siteUrl),
      searchKeepa(query, "jan"),
    ]);

    const bestRakuten = cheapest(rkResult.items);

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
    ];

    const merged: ProductResult | null = prices.length > 0
      ? {
          name: keepaResult.name ?? bestRakuten?.name ?? query,
          jan: query,
          asin: keepaResult.asin ?? undefined,
          imageUrl: keepaResult.imageUrl ?? bestRakuten?.imageUrl,
          amazonPrice: keepaResult.price,
          prices,
        }
      : null;

    return NextResponse.json({
      results: merged ? [merged] : [],
      meta: {
        mode: "compare",
        rakuten: { total: rkResult.total, shown: rkResult.items.length, hasMore: page < rkResult.pageCount },
        yahoo: { total: 0, shown: 0, hasMore: false },
        page: 1,
        hasMore: false,
      },
    });
  } catch (e) {
    console.error("[Search] unexpected error:", e);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
