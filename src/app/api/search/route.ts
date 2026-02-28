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

interface KeepaProduct {
  asin: string;
  title: string;
  imagesCSV?: string;
  stats?: {
    current: number[];
  };
}

async function searchKeepa(query: string): Promise<ProductResult[]> {
  const keepaKey = process.env.KEEPA_API_KEY;
  if (!keepaKey) return [];

  try {
    const url = new URL("https://api.keepa.com/query");
    url.searchParams.set("key", keepaKey);
    url.searchParams.set("domain", "5"); // amazon.co.jp
    url.searchParams.set("type", "search");
    url.searchParams.set("term", query);
    url.searchParams.set("stats", "1");
    url.searchParams.set("history", "0");

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("[Keepa] error:", res.status);
      return [];
    }
    const data = await res.json();
    const products: KeepaProduct[] = data.products || [];

    return products
      .map((p) => {
        // stats.current[0] = Amazon price in cents (divide by 100 for JPY)
        const rawPrice = p.stats?.current?.[0];
        const amazonPrice = rawPrice && rawPrice > 0 ? rawPrice / 100 : null;
        const asin = p.asin;
        const imageKey = p.imagesCSV?.split(",")?.[0];
        const imageUrl = imageKey
          ? `https://images-na.ssl-images-amazon.com/images/I/${imageKey}`
          : undefined;

        return {
          name: p.title,
          asin,
          imageUrl,
          amazonPrice,
          prices: amazonPrice
            ? [
                {
                  mall: "amazon" as const,
                  price: amazonPrice,
                  url: `https://www.amazon.co.jp/dp/${asin}`,
                  availability: "available" as const,
                },
              ]
            : [],
        };
      })
      .filter((p) => p.amazonPrice !== null);
  } catch (e) {
    console.error("[Keepa] fetch failed:", e);
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

    const [rakutenRes, keepaResults] = await Promise.all([
      fetch(rakutenUrl.toString(), {
        headers: { Referer: siteUrl, Origin: siteUrl },
      }),
      searchKeepa(query),
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

    const results = [...keepaResults, ...rakutenResults];
    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
