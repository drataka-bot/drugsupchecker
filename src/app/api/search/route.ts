import { NextRequest, NextResponse } from "next/server";
import { ProductResult } from "@/lib/types";

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

async function searchYahoo(query: string): Promise<ProductResult[]> {
  const appId = process.env.YAHOO_APP_ID;
  if (!appId) return [];

  try {
    const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
    url.searchParams.set("appid", appId);
    url.searchParams.set("query", query);
    url.searchParams.set("hits", "30");
    url.searchParams.set("sort", "+price");
    url.searchParams.set("in_stock", "1");

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("[Yahoo] error:", res.status, await res.text());
      return [];
    }
    const data = await res.json();
    const hits: YahooHit[] = data.hits || [];

    return hits.map((h) => ({
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
    }));
  } catch (e) {
    console.error("[Yahoo] fetch failed:", e);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query");
  const type = searchParams.get("type");

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const appId = process.env.RAKUTEN_APP_ID;
  const accessKey = process.env.RAKUTEN_ACCESS_KEY;
  if (!appId || !accessKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  try {
    const rakutenUrl = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601");
    rakutenUrl.searchParams.set("applicationId", appId);
    rakutenUrl.searchParams.set("accessKey", accessKey);
    rakutenUrl.searchParams.set("keyword", query);
    rakutenUrl.searchParams.set("hits", "30");
    rakutenUrl.searchParams.set("format", "json");
    rakutenUrl.searchParams.set("sort", "+itemPrice");

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://drugsupchecker.vercel.app";

    const [rakutenRes, yahooResults] = await Promise.all([
      fetch(rakutenUrl.toString(), {
        headers: { Referer: siteUrl, Origin: siteUrl },
      }),
      searchYahoo(query),
    ]);

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

    const results = [...rakutenResults, ...yahooResults];
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
