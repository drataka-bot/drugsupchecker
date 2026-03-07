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

  // Keepa APIテスト
  let keepaTest: { ok: boolean; status?: number; error?: string; tokensLeft?: number } = { ok: false };
  if (keepaValid) {
    try {
      const url = `https://api.keepa.com/product?key=${keepaKey}&domain=5&asin=B07S8TH8GX&stats=180`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        keepaTest = { ok: true, status: res.status, tokensLeft: data.tokensLeft };
      } else {
        const text = await res.text();
        keepaTest = { ok: false, status: res.status, error: text.slice(0, 200) };
      }
    } catch (e) {
      keepaTest = { ok: false, error: String(e) };
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

  return NextResponse.json({
    env: {
      KEEPA_API_KEY: keepaValid ? `✅ 設定済み (${keepaKey!.slice(0, 4)}...${keepaKey!.slice(-4)})` : `❌ 未設定 (値: "${keepaKey?.slice(0, 20)}")`,
      YAHOO_APP_ID:  yahooValid ? `✅ 設定済み (${yahooId!.slice(0, 4)}...${yahooId!.slice(-4)})` : `❌ 未設定 (値: "${yahooId?.slice(0, 20)}")`,
      RAKUTEN_APP_ID: rakutenValid ? `✅ 設定済み` : `❌ 未設定`,
    },
    api_test: {
      keepa: keepaValid ? keepaTest : "スキップ（キー未設定）",
      yahoo: yahooValid ? yahooTest : "スキップ（キー未設定）",
      rakuten: rakutenValid ? "設定済み（テストスキップ）" : "スキップ（キー未設定）",
    },
  });
}
