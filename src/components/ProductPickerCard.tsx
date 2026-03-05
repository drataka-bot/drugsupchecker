"use client";

import { ProductResult, MALL_LABELS, MALL_COLORS } from "@/lib/types";
import { ExternalLink } from "lucide-react";

interface ProductPickerCardProps {
  result: ProductResult;
  onCompare: (result: ProductResult) => void;
}

export default function ProductPickerCard({ result, onCompare }: ProductPickerCardProps) {
  const amazonPrice = result.amazonPrice;
  // Amazon以外の価格を安い順に並べる
  const mallPrices = result.prices
    .filter((p) => p.price !== null && p.availability !== "unavailable")
    .sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
      {/* 商品ヘッダー */}
      <div className="flex items-start gap-3 p-4">
        {result.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={result.imageUrl}
            alt={result.name}
            className="w-14 h-14 object-contain rounded bg-gray-50 border border-gray-200 flex-shrink-0"
          />
        ) : (
          <div className="w-14 h-14 bg-gray-100 rounded border border-gray-200 flex-shrink-0 flex items-center justify-center text-gray-300 text-xl">
            📦
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 leading-snug line-clamp-3">
            {result.name}
          </h3>

          <div className="flex flex-wrap gap-1.5 mt-2">
            {result.jan && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-mono">
                JAN: {result.jan}
              </span>
            )}
            {result.asin && (
              <span className="text-xs text-gray-500 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded font-mono">
                ASIN: {result.asin}
              </span>
            )}
          </div>

          {/* Amazon参考価格 */}
          {amazonPrice !== null && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Amazon:</span>
              <span className="text-sm font-bold text-orange-600">
                ¥{amazonPrice.toLocaleString()}
              </span>
              {result.asin && (
                <a
                  href={`https://www.amazon.co.jp/dp/${result.asin}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 inline-flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-700"
                >
                  <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}

          {/* 各モール価格（安い順） */}
          {mallPrices.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {mallPrices.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded text-white font-medium"
                    style={{ backgroundColor: MALL_COLORS[p.mall] }}
                  >
                    {MALL_LABELS[p.mall]}
                  </span>
                  <span className="text-sm font-bold text-gray-800">
                    ¥{p.price!.toLocaleString()}
                  </span>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-0.5 text-xs text-blue-500 hover:text-blue-700"
                  >
                    <ExternalLink size={10} />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 価格比較ボタン */}
      <div className="px-4 pb-4 mt-auto">
        <button
          onClick={() => onCompare(result)}
          className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5"
        >
          💰 この商品の価格を比較する
        </button>
      </div>
    </div>
  );
}
