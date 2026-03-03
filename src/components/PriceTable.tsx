"use client";

import { useState } from "react";
import { ProductResult, Mall, MALL_LABELS, MallPrice } from "@/lib/types";
import { ExternalLink, Heart, ChevronDown, ChevronUp } from "lucide-react";
import OverseasSearch from "./OverseasSearch";

interface PriceTableProps {
  result: ProductResult;
  thresholdPercent: number;
  isFavorited?: boolean;
  onToggleFavorite?: (result: ProductResult) => void;
}

const DOMESTIC_LINKS = [
  {
    name: "Amazon.co.jp",
    color: "#FF9900",
    buildUrl: ({ name, asin }: { name: string; asin?: string }) =>
      asin
        ? `https://www.amazon.co.jp/dp/${asin}`
        : `https://www.amazon.co.jp/s?k=${encodeURIComponent(name)}`,
  },
  {
    name: "ビックカメラ",
    color: "#003399",
    buildUrl: ({ name }: { name: string }) =>
      `https://www.biccamera.com/bc/category/?q=${encodeURIComponent(name)}`,
  },
  {
    name: "ヨドバシ",
    color: "#FF6600",
    buildUrl: ({ name }: { name: string }) =>
      `https://www.yodobashi.com/?word=${encodeURIComponent(name)}`,
  },
  {
    name: "au PAYマーケット",
    color: "#EA0029",
    buildUrl: ({ name }: { name: string }) =>
      `https://paymarket.au.com/s?keyword=${encodeURIComponent(name)}`,
  },
];

function calcDiff(amazonPrice: number | null, mallPrice: number | null): number | null {
  if (!amazonPrice || !mallPrice) return null;
  return ((mallPrice - amazonPrice) / amazonPrice) * 100;
}

function DiffBadge({ diff }: { diff: number | null }) {
  if (diff === null) return null;
  const abs = Math.abs(diff);
  const isCheaper = diff < 0;
  const label = `${isCheaper ? "▼" : "▲"}${abs.toFixed(1)}%`;

  if (isCheaper) {
    return (
      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-800">
        {label}
      </span>
    );
  }
  return (
    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
      {label}
    </span>
  );
}

function PriceRow({
  mallPrice,
  isAmazon,
  amazonPrice,
  thresholdPercent,
}: {
  mallPrice: MallPrice;
  isAmazon: boolean;
  amazonPrice: number | null;
  thresholdPercent: number;
}) {
  const diff = isAmazon ? null : calcDiff(amazonPrice, mallPrice.price);
  const isHighlighted = !isAmazon && diff !== null && Math.abs(diff) >= thresholdPercent;
  const isCheaper = diff !== null && diff < 0;
  const totalPrice =
    mallPrice.price !== null && mallPrice.shipping !== undefined
      ? mallPrice.price + mallPrice.shipping
      : mallPrice.price;

  return (
    <tr
      className={[
        "border-b border-gray-100 transition-colors",
        isAmazon ? "bg-orange-50" : "",
        isHighlighted && isCheaper ? "bg-green-50 hover:bg-green-100" : "",
        isHighlighted && !isCheaper ? "bg-red-50 hover:bg-red-100" : "",
        !isHighlighted && !isAmazon ? "hover:bg-gray-50" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-2 h-2 rounded-full"
            style={{
              backgroundColor: isAmazon
                ? "#FF9900"
                : isCheaper && isHighlighted
                ? "#16a34a"
                : !isCheaper && isHighlighted
                ? "#dc2626"
                : "#9ca3af",
            }}
          />
          <span className={`text-sm font-medium ${isAmazon ? "text-orange-700" : "text-gray-700"}`}>
            {MALL_LABELS[mallPrice.mall]}
            {isAmazon && <span className="ml-1 text-xs text-orange-500">(基準)</span>}
          </span>
        </div>
      </td>

      <td className="py-3 px-4 text-right">
        {mallPrice.availability === "unavailable" ? (
          <span className="text-gray-400 text-sm">取扱なし</span>
        ) : mallPrice.price === null ? (
          <span className="text-gray-400 text-sm">-</span>
        ) : (
          <div>
            <span className={`text-sm font-bold ${isAmazon ? "text-orange-600" : "text-gray-800"}`}>
              ¥{mallPrice.price.toLocaleString()}
            </span>
            {mallPrice.shipping !== undefined && mallPrice.shipping > 0 && (
              <span className="block text-xs text-gray-500">
                +送料¥{mallPrice.shipping.toLocaleString()}
              </span>
            )}
            {mallPrice.shipping === 0 && (
              <span className="block text-xs text-blue-500">送料無料</span>
            )}
          </div>
        )}
      </td>

      <td className="py-3 px-4 text-center">
        {!isAmazon && <DiffBadge diff={diff} />}
      </td>

      <td className="py-3 px-4 text-right">
        {totalPrice !== null && !isAmazon && mallPrice.shipping !== undefined && mallPrice.shipping > 0 ? (
          <span className="text-xs font-semibold text-gray-700">
            ¥{totalPrice.toLocaleString()}
          </span>
        ) : null}
      </td>

      <td className="py-3 px-4 text-center">
        {mallPrice.url && mallPrice.url !== "#" && (
          <a
            href={mallPrice.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            {mallPrice.price === null ? "Amazonで確認" : "商品ページ"}
            <ExternalLink size={12} />
          </a>
        )}
      </td>
    </tr>
  );
}

function ProfitCalculator({ lowestPrice }: { lowestPrice: number | null }) {
  const [amazonSellPrice, setAmazonSellPrice] = useState("");
  const [feeRate, setFeeRate] = useState(10);
  const [fbaFee, setFbaFee] = useState(0);
  const [open, setOpen] = useState(false);

  const sellPrice = parseFloat(amazonSellPrice) || 0;
  const profit = lowestPrice !== null && sellPrice > 0
    ? Math.round(sellPrice * (1 - feeRate / 100)) - lowestPrice - fbaFee
    : null;

  const profitRate = profit !== null && sellPrice > 0
    ? ((profit / sellPrice) * 100).toFixed(1)
    : null;

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium">💰 利益計算</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="px-4 pb-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Amazon販売価格</label>
              <input
                type="number"
                value={amazonSellPrice}
                onChange={(e) => setAmazonSellPrice(e.target.value)}
                placeholder="¥ 入力"
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Amazon手数料 (%)</label>
              <input
                type="number"
                value={feeRate}
                onChange={(e) => setFeeRate(Number(e.target.value))}
                min={0}
                max={50}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">FBA料金 (¥)</label>
              <input
                type="number"
                value={fbaFee}
                onChange={(e) => setFbaFee(Number(e.target.value))}
                min={0}
                className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {lowestPrice !== null && (
            <div className="text-xs text-gray-500">
              仕入価格(最安): <span className="font-semibold text-gray-700">¥{lowestPrice.toLocaleString()}</span>
            </div>
          )}

          {profit !== null && (
            <div className={`rounded-lg px-3 py-2 text-sm font-bold ${profit >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
              推定利益: ¥{profit.toLocaleString()}
              {profitRate && <span className="ml-2 font-normal text-xs">({profitRate}%)</span>}
            </div>
          )}

          <p className="text-xs text-gray-400">
            計算式: 販売価格 × (1 - 手数料%) - 仕入価格 - FBA料金
          </p>
        </div>
      )}
    </div>
  );
}

function DomesticLinks({ result }: { result: ProductResult }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium">🏪 他店舗で検索</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="px-4 pb-4 bg-gray-50">
          <div className="flex flex-wrap gap-2">
            {DOMESTIC_LINKS.map((site) => (
              <a
                key={site.name}
                href={site.buildUrl({ name: result.name, asin: result.asin })}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white hover:opacity-80 transition-opacity"
                style={{ backgroundColor: site.color }}
              >
                {site.name}
                <ExternalLink size={10} />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function PriceTable({
  result,
  thresholdPercent,
  isFavorited = false,
  onToggleFavorite,
}: PriceTableProps) {
  const allPrices: MallPrice[] = result.prices;
  const sortedNonAmazon = allPrices
    .filter((p) => p.mall !== "amazon")
    .sort((a, b) => {
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price;
    });

  const amazonEntry = allPrices.find((p) => p.mall === "amazon") ?? {
    mall: "amazon" as Mall,
    price: result.amazonPrice,
    url: result.asin
      ? `https://www.amazon.co.jp/dp/${result.asin}`
      : `https://www.amazon.co.jp/s?k=${encodeURIComponent(result.name)}`,
    availability: "unknown" as const,
  };

  const lowestPrice = sortedNonAmazon.find((p) => p.price !== null);
  const lowestDiff = lowestPrice
    ? calcDiff(result.amazonPrice, lowestPrice.price)
    : null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* 商品ヘッダー */}
      <div className="flex items-start gap-4 p-4 border-b border-gray-200 bg-gray-50">
        {result.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.imageUrl}
            alt={result.name}
            className="w-16 h-16 object-contain rounded bg-white border border-gray-200 flex-shrink-0"
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">
            {result.name}
          </h3>
          <div className="flex flex-wrap gap-2 mt-1">
            {result.jan && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                JAN: {result.jan}
              </span>
            )}
            {result.asin && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                ASIN: {result.asin}
              </span>
            )}
          </div>
          {lowestDiff !== null && lowestDiff < 0 && (
            <p className="mt-1 text-xs text-green-700 font-medium">
              最安値は{MALL_LABELS[lowestPrice!.mall]}で Amazonより{Math.abs(lowestDiff).toFixed(1)}%安い
            </p>
          )}
        </div>

        {/* お気に入りボタン */}
        {onToggleFavorite && (
          <button
            onClick={() => onToggleFavorite(result)}
            className={`flex-shrink-0 p-2 rounded-full transition-colors ${
              isFavorited
                ? "text-red-500 bg-red-50 hover:bg-red-100"
                : "text-gray-300 hover:text-red-400 hover:bg-red-50"
            }`}
            title={isFavorited ? "お気に入りから削除" : "お気に入りに追加"}
          >
            <Heart size={18} fill={isFavorited ? "currentColor" : "none"} />
          </button>
        )}
      </div>

      {/* 価格テーブル */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-200">
              <th className="text-left py-2 px-4 font-medium">モール</th>
              <th className="text-right py-2 px-4 font-medium">価格</th>
              <th className="text-center py-2 px-4 font-medium">差額</th>
              <th className="text-right py-2 px-4 font-medium">合計</th>
              <th className="text-center py-2 px-4 font-medium">リンク</th>
            </tr>
          </thead>
          <tbody>
            <PriceRow
              mallPrice={amazonEntry}
              isAmazon={true}
              amazonPrice={result.amazonPrice}
              thresholdPercent={thresholdPercent}
            />
            {sortedNonAmazon.map((mp) => (
              <PriceRow
                key={mp.mall}
                mallPrice={mp}
                isAmazon={false}
                amazonPrice={result.amazonPrice}
                thresholdPercent={thresholdPercent}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* 利益計算 */}
      <ProfitCalculator lowestPrice={lowestPrice?.price ?? null} />

      {/* 他店舗で検索 */}
      <DomesticLinks result={result} />

      {/* 海外EC検索 */}
      <OverseasSearch result={result} />
    </div>
  );
}
