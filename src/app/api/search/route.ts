import { NextRequest, NextResponse } from "next/server";
import { mockResults } from "@/lib/mockData";
import { ProductResult, SearchQuery } from "@/lib/types";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const type = searchParams.get("type") as SearchQuery["type"];

  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  // TODO: 実際のAPI/スクレイピングに置き換える
  // - Amazon: PA-API (Amazon Product Advertising API)
  //   → https://webservices.amazon.co.jp/paapi5/documentation/
  // - 楽天: 楽天市場商品検索API (無料・要APIキー)
  //   → https://webservice.rakuten.co.jp/documentation/ichiba-item-search
  // - Yahoo!ショッピング: Yahoo!ショッピング商品検索API (無料・要APIキー)
  //   → https://developer.yahoo.co.jp/webapi/shopping/
  // - ビックカメラ: 公式API なし → スクレイピング
  // - ヨドバシ: 公式API なし → スクレイピング
  // - au PAYマーケット: 公式API なし → スクレイピング

  await new Promise((resolve) => setTimeout(resolve, 800)); // 疑似遅延

  const results: ProductResult[] = mockResults.filter((r) => {
    if (type === "jan") return r.jan?.includes(query);
    if (type === "asin") return r.asin?.toLowerCase().includes(query.toLowerCase());
    return r.name.toLowerCase().includes(query.toLowerCase());
  });

  return NextResponse.json({ results });
}
