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
  asin: string | null;
  url: string | null;
  name: string | null;
  imageUrl: string | null;
}

// Keepa CSVの最新価格を取得 (価格は JPY * 100 で格納されている)
function latestKeepaPrice(csv: number[] | null | undefined): number | null {
  if (!csv || csv.length < 2) return null;
  // csv は [keepa_time, price, keepa_time, price, ...] の形式
  const last = csv[csv.length - 1];
  return last > 0 ? Math.round(last / 100) : null;
}

async function searchKeepa(identifier: string, type: "jan" | "asin"): Promise<KeepaResult> {
  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) return { price: null, asin: null, url: null, name: null, imageUrl: null };

  try {
    const url = new URL("https://api.keepa.com/product");
    url.searchParams.set("key", apiKey);
    url.searchParams.set("domain", "5"); // Amazon Japan

    if (type === "asin") {
      url.searchParams.set("asin", identifier);
    } else {
      url.searchParams.set("code", identifier); // JAN/EANコード
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("[Keepa] error:", res.status, await res.text());
      return { price: null, asin: null, url: null, name: null, imageUrl: null };
    }

    const data = await res.json();
    const product = data.products?.[0];
    if (!product) return { price: null, asin: null, url: null, name: null, imageUrl: null };

    const asin = product.asin as string;
    const amazonUrl = `https://www.amazon.co.jp/dp/${asin}`;
    const name: string | null = product.title ?? null;
    const imageUrl: string | null = product.imagesCSV
      ? `https://images-na.ssl-images-amazon.com/images/I/${product.imagesCSV.split(",")[0]}`
      : null;

    // csv[0]=Amazon直販, csv[1]=マーケットプレイス新品, csv[7]=FBA新品 の順で最安値を取得
    let currentPrice: number | null = null;
    for (const idx of [0, 1, 7]) {
      currentPrice = latestKeepaPrice(product.csv?.[idx]);
      if (currentPrice !== null) break;
    }

    return { price: currentPrice, asin, url: amazonUrl, name, imageUrl };
  } catch (e) {
    console.error("[Keepa] fetch failed:", e);
    return { price: null, asin: null, url: null, name: null, imageUrl: null };
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
      keepaType ? searchKeepa(query, keepaType) : Promise.resolve<KeepaResult>({ price: null, asin: null, url: null, name: null, imageUrl: null }),
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

      const amazonMallPrice: MallPrice | null =
        keepaResult.price !== null && keepaResult.url
          ? {
              mall: "amazon" as const,
              price: keepaResult.price,
              url: keepaResult.url,
              availability: "available" as const,
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
    if (type === "asin" && keepaResult.price !== null && keepaResult.url) {
      const amazonMallPrice: MallPrice = {
        mall: "amazon" as const,
        price: keepaResult.price,
        url: keepaResult.url,
        availability: "available" as const,
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
