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

/**
 * Keepa価格パース (JPY は * 100 で格納: 198000 → ¥1,980)
 * csv形式: [keepa_time, price, keepa_time, price, ...]
 * stats.current形式: [price_type_0, price_type_1, ...]
 */
function parseKeepaPrice(v: number | null | undefined): number | null {
  if (!v || v <= 0) return null;
  return Math.round(v / 100);
}

function priceFromStats(current: number[] | null | undefined): number | null {
  if (!current) return null;
  // 0=Amazon直販, 1=新品最安, 7=FBA新品, 2=中古最安
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
    if (arr && arr.length >= 2) {
      // 末尾要素が最新価格
      const p = parseKeepaPrice(arr[arr.length - 1]);
      if (p !== null) return p;
    }
  }
  return null;
}

async function searchKeepa(identifier: string, type: "jan" | "asin"): Promise<KeepaResult> {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) return KEEPA_NULL;

  try {
    const url = new URL("https://api.keepa.com/product");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("domain", "5"); // Amazon Japan
    url.searchParams.set("stats", "1");  // stats.current で現在価格を取得

    if (type === "asin") {
      url.searchParams.set("asin", identifier);
    } else {
      url.searchParams.set("code", identifier); // JAN/EANコード
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("[Keepa] error:", res.status, await res.text());
      return KEEPA_NULL;
    }

    const data = await res.json();
    const product = data.products?.[0];
    if (!product) return KEEPA_NULL;

    const asin = product.asin as string;
    const amazonUrl = `https://www.amazon.co.jp/dp/${asin}`;
    const name: string | null = product.title ?? null;
    const imageUrl: string | null = product.imagesCSV
      ? `https://images-na.ssl-images-amazon.com/images/I/${product.imagesCSV.split(",")[0]}`
      : null;

    // stats.current を優先、なければ csv の末尾値にフォールバック
    const currentPrice =
      priceFromStats(product.stats?.current) ??
      priceFromCsv(product.csv);

    return {
      price: currentPrice,
      availability: currentPrice !== null ? "available" : "unavailable",
      asin,
      url: amazonUrl,
      name,
      imageUrl,
    };
  } catch (e) {
    console.error("[Keepa] fetch failed:", e);
    return KEEPA_NULL;
  }
}

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

/** ProductResult配列から最安値のものを返す */
function cheapest(items: ProductResult[]): ProductResult | null {
  if (items.length === 0) return null;
  return items.reduce((a, b) =>
    (a.prices[0]?.price ?? Infinity) <= (b.prices[0]?.price ?? Infinity) ? a : b
  );
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const type = searchParams.get("type");
  const page = Math.max(1, Number(searchParams.get("page") || "1"));

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const appId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  const hitsPerPage = 30;

  try {
    const rakutenUrl = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601");
    rakutenUrl.searchParams.set("applicationId", appId);
    rakutenUrl.searchParams.set("accessKey", accessKey);
    rakutenUrl.searchParams.set("keyword", query);
    rakutenUrl.searchParams.set("hits", String(hitsPerPage));
    rakutenUrl.searchParams.set("page", String(page));
    rakutenUrl.searchParams.set("format", "json");
    rakutenUrl.searchParams.set("sort", "+itemPrice");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://drugsupchecker.vercel.app";

    // JANコード・ASIN検索時は Keepa も並列実行
    const keepaType = type === "jan" ? "jan" : type === "asin" ? "asin" : null;

    const [rakutenRes, yahooResults, keepaResult] = await Promise.all([
      fetch(rakutenUrl.toString(), {
        headers: { Referer: siteUrl, Origin: siteUrl },
      }),
      searchYahoo(query, page),
      keepaType ? searchKeepa(query, keepaType) : Promise.resolve<KeepaResult>(KEEPA_NULL),
    ] as const);

    const rakutenData = await rakutenRes.json();

    if (!rakutenRes.ok) {
      console.error("Rakuten API error:", rakutenRes.status, JSON.stringify(rakutenData));
      return NextResponse.json(
        { error: `Rakuten API error: ${rakutenRes.status} - ${JSON.stringify(rakutenData)}` },
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

    // JANコード検索: Amazon(Keepa) + 楽天最安 + Yahoo最安 を1枚のカードに統合
    if (type === "jan") {
      const bestRakuten = cheapest(rakutenResults);
      const bestYahoo = cheapest(yahooResults.items);

      // Keepaで商品が見つかった場合はASINがある → Amazon行を必ず追加（価格なしでも「取扱なし」表示）
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
          rakuten: { total: rakutenTotal, shown: rakutenResults.length, hasMore: false },
          yahoo: { total: yahooTotal, shown: yahooResults.shown, hasMore: false },
          page: 1,
          hasMore: false,
        },
      });
    }

    // ASIN検索: Amazon価格をKeepaから取得してresultに付与
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
          rakuten: { total: rakutenTotal, shown: rakutenResults.length, hasMore: false },
          yahoo: { total: yahooTotal, shown: yahooResults.shown, hasMore: false },
          page: 1,
          hasMore: false,
        },
      });
    }

    // 商品名検索: 楽天・Yahoo結果をそのまま混合表示
    const results = [...rakutenResults, ...yahooResults.items];
    return NextResponse.json({
      results,
      meta: {
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
