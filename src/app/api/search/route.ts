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
  url: string | null;
  name: string | null;
  imageUrl: string | null;
}

const KEEPA_NULL = { price: null, availability: "unknown" as const, asin: null, url: null, name: null, imageUrl: null };

// ─────────────────────────────────────────────────────────────────
// Keepa 価格パース
// ─────────────────────────────────────────────────────────────────

function parseKeepaPrice(v: number | null | undefined): number | null {
  if (!v || v <= 0) return null;
  return Math.round(v / 100);
}

function priceFromStats(current: number[] | null | undefined): number | null {
  if (!current) return null;
  for (const idx of [0, 1, 7, 2]) {
    const p = parseKeepaPrice(current[idx]);
    if (p !== null) return p;
  }
  return null;
}

function priceFromCsv(csv: (number[] | null)[] | null | undefined): number | null {
  if (!csv) return null;
  for (const idx of [0, 1, 7, 2]) {
    const arr = csv[idx];
    if (!arr || arr.length < 2) continue;
    const p = parseKeepaPrice(arr[arr.length - 1]);
    if (p !== null) return p;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────
// Keepa: 商品名 → 複数商品リスト (discover mode 用)
// 2ステップ: /search(keyword→ASINs) → /product(ASINs→詳細)
// ─────────────────────────────────────────────────────────────────

async function searchKeepaByTermMultiple(term: string): Promise<ProductResult[]> {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) return [];

  try {
    const searchUrl = new URL("https://api.keepa.com/search");
    searchUrl.searchParams.set("key", apiKey);
    searchUrl.searchParams.set("domain", "5");
    searchUrl.searchParams.set("type", "product");
    searchUrl.searchParams.set("term", term);

    const searchRes = await fetch(searchUrl.toString());
    if (!searchRes.ok) {
      console.error("[Keepa/search] error:", searchRes.status);
      return [];
    }
    const searchData = await searchRes.json();
    const asinList: string[] = searchData.searchResult?.asinList ?? [];
    if (asinList.length === 0) return [];

    const topAsins = asinList.slice(0, 10).join(",");

    const prodUrl = new URL("https://api.keepa.com/product");
    prodUrl.searchParams.set("key", apiKey);
    prodUrl.searchParams.set("domain", "5");
    prodUrl.searchParams.set("stats", "180");
    prodUrl.searchParams.set("asin", topAsins);

    const prodRes = await fetch(prodUrl.toString());
    if (!prodRes.ok) {
      console.error("[Keepa/product] error:", prodRes.status);
      return [];
    }
    const prodData = await prodRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const products: any[] = prodData.products ?? [];

    console.log("[Keepa/search]", `"${term}"`, "→", products.length, "products");

    return products.map((p) => {
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
  } catch (e) {
    console.error("[Keepa/search/multi] error:", e);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────
// Keepa: JAN/ASIN → 価格+商品情報 (compare mode 用)
// ─────────────────────────────────────────────────────────────────

async function searchKeepa(identifier: string, type: "jan" | "asin"): Promise<KeepaResult> {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) return KEEPA_NULL;

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

    const res = await fetch(url.toString());
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
    // buyBoxPrice: stats.buyBoxPrice は Buy Box の直接価格
    const buyBoxRaw = product.stats?.buyBoxPrice as number | null | undefined;
    const buyBoxPrice = parseKeepaPrice(buyBoxRaw);
    const currentPrice = priceFromSt ?? buyBoxPrice ?? priceFromCv;

    // デバッグ: Keepaが返した生データを確認
    console.log("[Keepa]", asin, "→ price:", currentPrice,
      "| stats.current:", JSON.stringify(statsCurrent?.slice(0, 10)),
      "| csv[0]last:", (product.csv?.[0] as number[] | null)?.slice(-2),
      "| csv[1]last:", (product.csv?.[1] as number[] | null)?.slice(-2),
      "| csv[7]last:", (product.csv?.[7] as number[] | null)?.slice(-2),
    );

    return {
      price: currentPrice,
      // ASIN が判明している場合は "unknown" にして商品ページリンクを表示する
      // "unavailable" にするとリンクが非表示になってしまうため使わない
      availability: currentPrice !== null ? "available" : "unknown",
      asin,
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
// Yahoo! ショッピング
// ─────────────────────────────────────────────────────────────────

async function searchYahoo(query: string, page: number): Promise<YahooResult> {
  const appId = process.env.YAHOO_APP_ID;
  if (!appId) return { items: [], total: 0, shown: 0 };

  const hitsPerPage = 30;
  const start = (page - 1) * hitsPerPage + 1;

  try {
    const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
    url.searchParams.set("appid", appId);
    url.searchParams.set("query", query);
    url.searchParams.set("hits", String(hitsPerPage));
    url.searchParams.set("start", String(start));
    url.searchParams.set("sort", "+price");
    url.searchParams.set("in_stock", "1");

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("[Yahoo] error:", res.status, await res.text());
      return { items: [], total: 0, shown: 0 };
    }
    const data = await res.json();
    const hits: YahooHit[] = data.hits || [];

    return {
      items: hits.map((h) => ({
        name: h.name,
        jan: h.janCode,
        imageUrl: h.image?.medium || h.image?.small,
        amazonPrice: null,
        prices: [
          {
            mall: "yahoo" as const,
            price: h.price,
            url: h.url,
            availability: h.inStock ? ("available" as const) : ("unavailable" as const),
            shipping: h.shipping?.code === 0 ? 0 : undefined,
          },
        ],
      })),
      total: data.totalResultsAvailable ?? hits.length,
      shown: hits.length,
    };
  } catch (e) {
    console.error("[Yahoo] fetch failed:", e);
    return { items: [], total: 0, shown: 0 };
  }
}

function cheapest(items: ProductResult[]): ProductResult | null {
  if (items.length === 0) return null;
  return items.reduce((a, b) =>
    (a.prices[0]?.price ?? Infinity) <= (b.prices[0]?.price ?? Infinity) ? a : b
  );
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
    // Rakuten APIキー不要
    // ═══════════════════════════════════════════════════════════
    if (type === "name") {
      // Keepaで商品リスト取得 (ASIN+EAN+Amazon参考価格)
      const keepaProducts = await searchKeepaByTermMultiple(query);
      if (keepaProducts.length > 0) {
        return NextResponse.json({
          results: keepaProducts,
          meta: {
            mode: "discover",
            rakuten: { total: 0, shown: 0, hasMore: false },
            yahoo: { total: 0, shown: 0, hasMore: false },
            page: 1,
            hasMore: false,
          },
        });
      }

      // Keepa未設定 or 結果なし → Yahoo検索フォールバック
      const yahooFallback = await searchYahoo(query, page);
      const yahooPageCount = Math.ceil(yahooFallback.total / hitsPerPage);
      return NextResponse.json({
        results: yahooFallback.items,
        meta: {
          mode: "discover",
          rakuten: { total: 0, shown: 0, hasMore: false },
          yahoo: { total: yahooFallback.total, shown: yahooFallback.shown, hasMore: page < yahooPageCount },
          page,
          hasMore: page < yahooPageCount,
        },
      });
    }

    // ═══════════════════════════════════════════════════════════
    // compare モード: JAN/ASIN → Amazon+楽天+Yahoo 価格比較
    // ═══════════════════════════════════════════════════════════
    const appId = process.env.RAKUTEN_APP_ID;
    const accessKey = process.env.RAKUTEN_ACCESS_KEY;
    if (!appId || !accessKey) {
      return NextResponse.json({ error: "API key not configured" }, { status: 500 });
    }

    const keepaType = type === "jan" ? "jan" : type === "asin" ? "asin" : null;

    const rakutenUrl = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601");
    rakutenUrl.searchParams.set("applicationId", appId);
    rakutenUrl.searchParams.set("accessKey", accessKey);
    rakutenUrl.searchParams.set("keyword", query);
    rakutenUrl.searchParams.set("hits", String(hitsPerPage));
    rakutenUrl.searchParams.set("page", String(page));
    rakutenUrl.searchParams.set("format", "json");
    rakutenUrl.searchParams.set("sort", "+itemPrice");

    const [rakutenRes, yahooResults, keepaResult] = await Promise.all([
      fetch(rakutenUrl.toString(), { headers: { Referer: siteUrl, Origin: siteUrl } }),
      searchYahoo(query, page),
      keepaType ? searchKeepa(query, keepaType) : Promise.resolve<KeepaResult>(KEEPA_NULL),
    ] as const);

    const rakutenData = await rakutenRes.json();
    if (!rakutenRes.ok) {
      console.error("Rakuten API error:", rakutenRes.status, JSON.stringify(rakutenData));
      return NextResponse.json(
        { error: `Rakuten API error: ${rakutenRes.status}` },
        { status: 500 }
      );
    }

    const rakutenResults: ProductResult[] = (rakutenData.Items || []).map((item: RakutenItem) => ({
      name: item.Item.itemName,
      jan: type === "jan" ? query : undefined,
      imageUrl: item.Item.mediumImageUrls?.[0]?.imageUrl,
      amazonPrice: null,
      prices: [
        {
          mall: "rakuten" as const,
          price: item.Item.itemPrice,
          url: item.Item.itemUrl,
          availability: "available" as const,
        },
      ],
    }));

    const rakutenTotal: number = rakutenData.count ?? rakutenResults.length;
    const rakutenPageCount: number = rakutenData.pageCount ?? Math.ceil(rakutenTotal / hitsPerPage);
    const yahooTotal = yahooResults.total;
    const yahooPageCount = Math.ceil(yahooTotal / hitsPerPage);

    // JAN検索: Amazon + 楽天最安 + Yahoo最安 を1枚に統合
    if (type === "jan") {
      const bestRakuten = cheapest(rakutenResults);
      const bestYahoo = cheapest(yahooResults.items);

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
          rakuten: { total: rakutenTotal, shown: rakutenResults.length, hasMore: false },
          yahoo: { total: yahooTotal, shown: yahooResults.shown, hasMore: false },
          page: 1,
          hasMore: false,
        },
      });
    }

    // ASIN検索
    if (type === "asin" && keepaResult.asin) {
      const amazonMallPrice: MallPrice = {
        mall: "amazon" as const,
        price: keepaResult.price,
        url: keepaResult.url ?? `https://www.amazon.co.jp/dp/${keepaResult.asin}`,
        availability: keepaResult.availability,
      };
      const asinResult: ProductResult = {
        name: keepaResult.name ?? query,
        asin: keepaResult.asin ?? query,
        imageUrl: keepaResult.imageUrl ?? undefined,
        amazonPrice: keepaResult.price,
        prices: [amazonMallPrice, ...rakutenResults.flatMap((r) => r.prices), ...yahooResults.items.flatMap((r) => r.prices)],
      };
      return NextResponse.json({
        results: [asinResult],
        meta: {
          mode: "compare",
          rakuten: { total: rakutenTotal, shown: rakutenResults.length, hasMore: false },
          yahoo: { total: yahooTotal, shown: yahooResults.shown, hasMore: false },
          page: 1,
          hasMore: false,
        },
      });
    }

    // Fallback: JAN/ASIN 検索で Keepa 未設定の場合は楽天+Yahoo をそのまま返す
    return NextResponse.json({
      results: [...rakutenResults, ...yahooResults.items],
      meta: {
        mode: "compare",
        rakuten: { total: rakutenTotal, shown: rakutenResults.length, hasMore: page < rakutenPageCount },
        yahoo: { total: yahooTotal, shown: yahooResults.shown, hasMore: page < yahooPageCount },
        page,
        hasMore: page < rakutenPageCount || page < yahooPageCount,
      },
    });
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
