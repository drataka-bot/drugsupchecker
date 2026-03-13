import { NextResponse } from "next/server";

export async function GET() {
  const keepaKey = process.env.KEEPA_API_KEY;
  const yahooId = process.env.YAHOO_APP_ID;
  const rakutenAppId = process.env.RAKUTEN_APP_ID;
  const rakutenAccessKey = process.env.RAKUTEN_ACCESS_KEY;

  function isValid(key: string | undefined) {
    if (!key || key.length < 4) return false;
    if (/[\u3000-\u9fff\s]/.test(key)) return false;
    return true;
  }

  const keepaValid = isValid(keepaKey);
  const yahooValid = isValid(yahooId);
  const rakutenValid = isValid(rakutenAppId) && isValid(rakutenAccessKey);

  // Keepa product lookup テスト
  let keepaProductTest: { ok: boolean; status?: number; error?: string; tokensLeft?: number; productFound?: boolean; price?: number | null } = { ok: false };
  // Keepa search テスト（名前検索が動くか確認）
  let keepaSearchTest: { ok: boolean; status?: number; error?: string; asinCount?: number; firstAsin?: string } = { ok: false };

  if (keepaValid) {
    try {
      const url = `https://api.keepa.com/product?key=${keepaKey}&domain=5&asin=B07S8TH8GX&stats=180`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        const product = data.products?.[0];
        const stats = product?.stats?.current;
        const price = stats ? (stats[0] > 0 ? Math.round(stats[0] / 100) : stats[7] > 0 ? Math.round(stats[7] / 100) : null) : null;
        keepaProductTest = { ok: true, status: res.status, tokensLeft: data.tokensLeft, productFound: !!product, price };
      } else {
        const text = await res.text();
        keepaProductTest = { ok: false, status: res.status, error: text.slice(0, 200) };
      }
    } catch (e) {
      keepaProductTest = { ok: false, error: String(e) };
    }

    // Keepa search テスト
    try {
      const url = `https://api.keepa.com/search?key=${keepaKey}&domain=5&type=product&term=vitamin+c+supplement`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        const asinList: string[] = data.searchResult?.asinList ?? [];
        keepaSearchTest = { ok: true, status: res.status, asinCount: asinList.length, firstAsin: asinList[0] };
      } else {
        const text = await res.text();
        keepaSearchTest = { ok: false, status: res.status, error: text.slice(0, 200) };
      }
    } catch (e) {
      keepaSearchTest = { ok: false, error: String(e) };
    }
  }

  // Yahoo APIテスト
  let yahooTest: { ok: boolean; status?: number; error?: string; total?: number } = { ok: false };
  if (yahooValid) {
    try {
      const url = `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch?appid=${yahooId}&query=ビタミンC&hits=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        yahooTest = { ok: true, status: res.status, total: data.totalResultsAvailable };
      } else {
        const text = await res.text();
        yahooTest = { ok: false, status: res.status, error: text.slice(0, 200) };
      }
    } catch (e) {
      yahooTest = { ok: false, error: String(e) };
    }
  }

  // Yahoo Shopping スクレイプテスト
  let yahooScrapeTest: { ok: boolean; error?: string; htmlLength?: number; hasNextData?: boolean } = { ok: false };
  try {
    const res = await fetch("https://shopping.yahoo.co.jp/search?p=vitamin+c", {
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "ja-JP,ja;q=0.9",
      },
    });
    if (res.ok) {
      const html = await res.text();
      yahooScrapeTest = {
        ok: true,
        htmlLength: html.length,
        hasNextData: html.includes("__NEXT_DATA__"),
      };
    } else {
      yahooScrapeTest = { ok: false, error: `HTTP ${res.status}` };
    }
  } catch (e) {
    yahooScrapeTest = { ok: false, error: String(e) };
  }

  return NextResponse.json({
    env: {
      KEEPA_API_KEY: keepaValid ? `✅ 設定済み (${keepaKey!.slice(0, 4)}...${keepaKey!.slice(-4)})` : `❌ 未設定 (値: "${keepaKey?.slice(0, 20)}")`,
      YAHOO_APP_ID:  yahooValid ? `✅ 設定済み (${yahooId!.slice(0, 4)}...${yahooId!.slice(-4)})` : `❌ 未設定 (値: "${yahooId?.slice(0, 20)}")`,
      RAKUTEN_APP_ID: rakutenValid ? `✅ 設定済み` : `❌ 未設定`,
    },
    api_test: {
      keepa_product: keepaValid ? keepaProductTest : "スキップ（キー未設定）",
      keepa_search: keepaValid ? keepaSearchTest : "スキップ（キー未設定）",
      yahoo_api: yahooValid ? yahooTest : "スキップ（キー未設定）",
      yahoo_scrape: yahooScrapeTest,
    },
    note: "keepa_search.asinCount が 0 の場合、名前検索が機能していません。keepa_product が ok=true なら比較モードは動作します。",
  });
}
