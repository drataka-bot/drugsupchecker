/**
 * Keepa/Rakuten/Yahoo モック統合テスト
 * 実際のAPIレスポンス形式を再現して route.ts の全フローを検証
 * run: node test-integration.mjs
 */

// ── 価格パース関数 (route.ts からコピー) ──────────────────────────
function parseKeepaPrice(v) {
  if (!v || v <= 0) return null;
  return Math.round(v / 100);
}

function priceFromStats(current) {
  if (!current) return null;
  for (const idx of [0, 1, 7, 2]) {
    const p = parseKeepaPrice(current[idx]);
    if (p !== null) return p;
  }
  return null;
}

function priceFromCsv(csv) {
  if (!csv) return null;
  for (const idx of [0, 1, 7, 2]) {
    const arr = csv[idx];
    if (!arr || arr.length < 2) continue;
    const p = parseKeepaPrice(arr[arr.length - 1]);
    if (p !== null) return p;
  }
  return null;
}

// ── モックAPIレスポンス ──────────────────────────────────────────
const JAN = "4987123143836"; // パブロンゴールドA

/** Keepa API /product?code=... のモックレスポンス */
const KEEPA_RESPONSE = {
  tokensLeft: 9500,
  products: [
    {
      asin: "B001MOCKASI",
      title: "パブロンゴールドA 微粒 44包",
      imagesCSV: "71abc123XYL.jpg,71def456XYL.jpg",
      stats: {
        // stats.current: index=価格タイプ (×100=円)
        // [0]=Amazon直販, [1]=新品最安, [2]=中古, [7]=FBA
        current: [
          -1,      // 0: Amazon直販なし
          198000,  // 1: 新品マーケットプレイス ¥1,980
          -1,      // 2: 中古なし
          12345,   // 3: 順位(価格ではない)
          -1, -1, -1,
          210000,  // 7: FBA ¥2,100
        ],
      },
      csv: null, // history=0 なので csv なし
    },
  ],
};

/** 楽天 API のモックレスポンス */
const RAKUTEN_RESPONSE = {
  count: 2,
  pageCount: 1,
  Items: [
    {
      Item: {
        itemName: "パブロンゴールドA 微粒 44包",
        itemPrice: 1728,
        itemUrl: "https://item.rakuten.co.jp/mock/pavuron/",
        mediumImageUrls: [{ imageUrl: "https://thumbnail.image.rakuten.co.jp/pavuron.jpg" }],
      },
    },
    {
      Item: {
        itemName: "パブロンゴールドA 微粒 44包 大箱",
        itemPrice: 3240,
        itemUrl: "https://item.rakuten.co.jp/mock/pavuron-big/",
        mediumImageUrls: [],
      },
    },
  ],
};

/** Yahoo Shopping API のモックレスポンス */
const YAHOO_RESPONSE = {
  hits: [
    {
      name: "パブロンゴールドA 微粒 44包",
      price: 1650,
      url: "https://store.shopping.yahoo.co.jp/mock/pavuron",
      image: { medium: "https://item-shopping.c.yimg.jp/i/g/mock_pavuron.jpg" },
      janCode: JAN,
      inStock: true,
      shipping: { code: 0 },
    },
    {
      name: "パブロンゴールドA 微粒 44包",
      price: 1780,
      url: "https://store.shopping.yahoo.co.jp/mock2/pavuron",
      image: { medium: "https://item-shopping.c.yimg.jp/i/g/mock2_pavuron.jpg" },
      janCode: JAN,
      inStock: true,
    },
  ],
  totalResultsAvailable: 2,
};

// ── モック fetch ────────────────────────────────────────────────
function mockFetch(url) {
  const u = url.toString();
  if (u.includes("api.keepa.com")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(KEEPA_RESPONSE),
    });
  }
  if (u.includes("openapi.rakuten.co.jp")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(RAKUTEN_RESPONSE),
    });
  }
  if (u.includes("shopping.yahooapis.jp")) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(YAHOO_RESPONSE),
    });
  }
  return Promise.reject(new Error("Unknown URL: " + u));
}

// ── ルートロジック再現 (route.ts の searchKeepa / searchYahoo / GET を模倣) ──
async function searchKeepa(identifier, type) {
  const url = new URL("https://api.keepa.com/product");
  url.searchParams.set("key", "TEST_KEY");
  url.searchParams.set("domain", "5");
  url.searchParams.set("stats", "1");
  url.searchParams.set("history", "0");
  if (type === "asin") url.searchParams.set("asin", identifier);
  else url.searchParams.set("code", identifier);

  const res = await mockFetch(url);
  const data = await res.json();
  const product = data.products?.[0];
  if (!product) return { price: null, availability: "unknown", asin: null, url: null, name: null, imageUrl: null };

  const asin = product.asin;
  const name = product.title ?? null;
  const imageUrl = product.imagesCSV
    ? `https://images-na.ssl-images-amazon.com/images/I/${product.imagesCSV.split(",")[0]}`
    : null;
  const statsCurrent = product.stats?.current;
  const currentPrice = priceFromStats(statsCurrent) ?? priceFromCsv(product.csv);

  return {
    price: currentPrice,
    availability: currentPrice !== null ? "available" : "unavailable",
    asin,
    url: `https://www.amazon.co.jp/dp/${asin}`,
    name,
    imageUrl,
  };
}

async function searchYahoo(query) {
  const url = new URL("https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch");
  url.searchParams.set("appid", "TEST_YAHOO");
  url.searchParams.set("query", query);

  const res = await mockFetch(url);
  const data = await res.json();
  const hits = data.hits || [];
  return {
    items: hits.map(h => ({
      name: h.name,
      jan: h.janCode,
      imageUrl: h.image?.medium,
      amazonPrice: null,
      prices: [{
        mall: "yahoo",
        price: h.price,
        url: h.url,
        availability: h.inStock ? "available" : "unavailable",
        shipping: h.shipping?.code === 0 ? 0 : undefined,
      }],
    })),
    total: data.totalResultsAvailable ?? hits.length,
    shown: hits.length,
  };
}

function cheapest(items) {
  if (!items.length) return null;
  return items.reduce((a, b) =>
    (a.prices[0]?.price ?? Infinity) <= (b.prices[0]?.price ?? Infinity) ? a : b
  );
}

async function simulateJanSearch(query) {
  const rakutenUrl = new URL("https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20220601");
  rakutenUrl.searchParams.set("keyword", query);

  const [rakutenRes, yahooResults, keepaResult] = await Promise.all([
    mockFetch(rakutenUrl),
    searchYahoo(query),
    searchKeepa(query, "jan"),
  ]);

  const rakutenData = await rakutenRes.json();
  const rakutenResults = (rakutenData.Items || []).map(item => ({
    name: item.Item.itemName,
    jan: query,
    imageUrl: item.Item.mediumImageUrls?.[0]?.imageUrl,
    amazonPrice: null,
    prices: [{ mall: "rakuten", price: item.Item.itemPrice, url: item.Item.itemUrl, availability: "available" }],
  }));

  const bestRakuten = cheapest(rakutenResults);
  const bestYahoo = cheapest(yahooResults.items);
  const amazonMallPrice = keepaResult.asin
    ? { mall: "amazon", price: keepaResult.price, url: keepaResult.url, availability: keepaResult.availability }
    : null;

  const prices = [
    ...(amazonMallPrice ? [amazonMallPrice] : []),
    ...(bestRakuten ? bestRakuten.prices : []),
    ...(bestYahoo ? bestYahoo.prices : []),
  ];

  return {
    name: keepaResult.name ?? bestRakuten?.name ?? bestYahoo?.name ?? query,
    jan: query,
    asin: keepaResult.asin ?? undefined,
    imageUrl: keepaResult.imageUrl ?? bestRakuten?.imageUrl ?? bestYahoo?.imageUrl,
    amazonPrice: keepaResult.price,
    prices,
  };
}

// ── テスト実行 ──────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(label, got, expected) {
  const ok = JSON.stringify(got) === JSON.stringify(expected);
  if (ok) { console.log(`  ✅ ${label}: ${JSON.stringify(got)}`); passed++; }
  else { console.error(`  ❌ ${label}\n     got:      ${JSON.stringify(got)}\n     expected: ${JSON.stringify(expected)}`); failed++; }
}

console.log("\n=== JAN検索 統合フローテスト ===");
const result = await simulateJanSearch(JAN);
console.log("\n--- 返却された商品カード ---");
console.log(JSON.stringify(result, null, 2));
console.log("----------------------------\n");

// 基本情報
test("商品名あり", typeof result.name === "string" && result.name.length > 0, true);
test("JANコード", result.jan, JAN);
test("ASIN", result.asin, "B001MOCKASI");
test("画像URLあり", result.imageUrl?.startsWith("https://"), true);

// Keepa (Amazon) 価格
test("amazonPrice=¥1,980 (stats.current[1]から取得)", result.amazonPrice, 1980);
const amazon = result.prices.find(p => p.mall === "amazon");
test("Amazon価格行あり", !!amazon, true);
test("Amazon URL形式", amazon?.url, "https://www.amazon.co.jp/dp/B001MOCKASI");
test("Amazon availability=available", amazon?.availability, "available");

// 楽天価格 (最安=¥1,728)
const rakuten = result.prices.find(p => p.mall === "rakuten");
test("楽天最安=¥1,728", rakuten?.price, 1728);

// Yahoo価格 (最安=¥1,650)
const yahoo = result.prices.find(p => p.mall === "yahoo");
test("Yahoo最安=¥1,650", yahoo?.price, 1650);
test("Yahoo送料無料(shipping=0)", yahoo?.shipping, 0);

// 全モール揃い
test("価格行数=3モール", result.prices.length, 3);

console.log(`\n${"=".repeat(40)}`);
console.log(`結果: ${passed} 件成功 / ${failed} 件失敗`);
if (failed > 0) process.exit(1);
