/**
 * Keepa 価格パースロジックのユニットテスト (Node.js で直接実行可)
 * run: node test-keepa.mjs
 */

// ---- コピー: route.ts の純粋関数 ----
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

// ---- テストヘルパー ----
let passed = 0, failed = 0;
function test(label, got, expected) {
  if (got === expected) {
    console.log(`  ✅ ${label}: ${got}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}: got=${got}, expected=${expected}`);
    failed++;
  }
}

// ---- parseKeepaPrice ----
console.log("\n=== parseKeepaPrice ===");
test("¥1,980 (198000)", parseKeepaPrice(198000), 1980);
test("¥298 (29800)", parseKeepaPrice(29800), 298);
test("取扱なし(-1)", parseKeepaPrice(-1), null);
test("null", parseKeepaPrice(null), null);
test("undefined", parseKeepaPrice(undefined), null);
test("0", parseKeepaPrice(0), null);

// ---- priceFromStats ----
console.log("\n=== priceFromStats ===");
// Amazon直販あり
test(
  "Amazon直販(idx=0)あり",
  priceFromStats([-1, 198000, -1, -1, -1, -1, -1, 210000]),
  1980  // idx=0 は -1 なので idx=1 の 198000 → 1980
);
// ↑ 注意: idx=0 が -1 → idx=1 の 198000 = ¥1980
const statsAllMinus = [-1, -1, -1, -1, -1, -1, -1, -1];
test("全て取扱なし", priceFromStats(statsAllMinus), null);
test("Amazon直販(idx=0)=¥500", priceFromStats([50000, -1, -1, -1, -1, -1, -1, -1]), 500);
test("FBA(idx=7)のみ", priceFromStats([-1, -1, -1, -1, -1, -1, -1, 99800]), 998);
test("null渡し", priceFromStats(null), null);

// ---- priceFromCsv ----
console.log("\n=== priceFromCsv ===");
// Keepa CSV形式: [time, price, time, price, ...]
// 1000=keepa時刻(ダミー), 198000=¥1980

// Amazon直販(csv[0])が現在有効
const csvAmazonActive = [
  [1000, 198000],   // csv[0]: Amazon direct → 末尾 198000 = ¥1980
  null, null, null, null, null, null, null
];
test("Amazon直販(csv[0]) ¥1,980", priceFromCsv(csvAmazonActive), 1980);

// Amazon直販が取扱なし、新品(csv[1])にフォールバック
const csvAmazonUnavailable = [
  [1000, 198000, 2000, -1],  // csv[0]: 最終が -1 = 現在取扱なし
  [1000, 299800],             // csv[1]: 新品 ¥2,998
  null, null, null, null, null, null
];
test("Amazon取扱なし→新品(csv[1]) ¥2,998", priceFromCsv(csvAmazonUnavailable), 2998);

// 全て取扱なし
const csvAllUnavailable = [
  [1000, -1], [1000, -1], [1000, -1], null, null, null, null, [1000, -1]
];
test("全csv取扱なし", priceFromCsv(csvAllUnavailable), null);

// history=0 で csv が null の場合
test("csv=null (history=0時)", priceFromCsv(null), null);

// FBA(csv[7])のみ有効
const csvFbaOnly = [
  [1000, -1], [1000, -1], [1000, -1], null, null, null, null, [1000, 148000]
];
test("FBA(csv[7]) ¥1,480", priceFromCsv(csvFbaOnly), 1480);

// ---- Keepa API レスポンス模倣テスト ----
console.log("\n=== Keepa APIレスポンス全体フロー模倣 ===");
function simulateKeepa(product) {
  if (!product) return { price: null };
  const statsCurrent = product.stats?.current;
  const priceFromSt = priceFromStats(statsCurrent);
  const priceFromCv = priceFromCsv(product.csv);
  const currentPrice = priceFromSt ?? priceFromCv;
  return { price: currentPrice, asin: product.asin };
}

// ケース1: stats.currentにAmazon価格
const product1 = {
  asin: "B07EXAMPLE1",
  stats: { current: [-1, 198000, -1, -1, -1, -1, -1, 210000] },
  csv: null,
};
const r1 = simulateKeepa(product1);
test("フロー: stats.current[1]=¥1,980", r1.price, 1980);

// ケース2: stats=nullでcsv fallback
const product2 = {
  asin: "B07EXAMPLE2",
  stats: null,
  csv: [[1000, 350000], null, null, null, null, null, null, null],
};
const r2 = simulateKeepa(product2);
test("フロー: stats=null → csv[0]=¥3,500", r2.price, 3500);

// ケース3: 商品未発見
test("フロー: product=null", simulateKeepa(null).price, null);

// ケース4: 全て-1
const product4 = {
  asin: "B07EXAMPLE4",
  stats: { current: [-1, -1, -1, -1, -1, -1, -1, -1] },
  csv: [[1000, -1], [1000, -1], [1000, -1], null, null, null, null, [1000, -1]],
};
test("フロー: 全取扱なし → null", simulateKeepa(product4).price, null);

// ---- 結果 ----
console.log(`\n${"=".repeat(40)}`);
console.log(`結果: ${passed} 件成功 / ${failed} 件失敗`);
if (failed > 0) process.exit(1);
