"use client";

import { ProductResult, Mall, MALL_LABELS, MallPrice } from "@/lib/types";
import { ExternalLink } from "lucide-react";
import OverseasSearch from "./OverseasSearch";

interface PriceTableProps {
  result: ProductResult;
  thresholdPercent: number;
}

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
        {mallPrice.availability !== "unavailable" && mallPrice.price !== null && (
          <a
            href={mallPrice.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
          >
            商品ページ
            <ExternalLink size={12} />
          </a>
        )}
      </td>
    </tr>
  );
}

export default function PriceTable({ result, thresholdPercent }: PriceTableProps) {
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
    url: "#",
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

      {/* 海外EC検索 */}
      <OverseasSearch result={result} />
    </div>
  );
}
