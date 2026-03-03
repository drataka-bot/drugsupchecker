"use client";

import { ProductResult, MALL_LABELS } from "@/lib/types";
import { ExternalLink } from "lucide-react";

interface ProductPickerCardProps {
  result: ProductResult;
  onCompare: (result: ProductResult) => void;
}

export default function ProductPickerCard({ result, onCompare }: ProductPickerCardProps) {
  const amazonPrice = result.amazonPrice;

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

          {amazonPrice !== null && (
            <div className="mt-2 flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Amazon参考価格:</span>
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
                  {MALL_LABELS.amazon}
                  <ExternalLink size={10} />
                </a>
              )}
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
