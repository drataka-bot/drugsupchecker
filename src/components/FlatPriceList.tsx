"use client";

import { ProductResult, Mall, MALL_LABELS, MALL_COLORS } from "@/lib/types";
import { ExternalLink } from "lucide-react";

interface FlatListing {
  productName: string;
  jan?: string;
  asin?: string;
  imageUrl?: string;
  mall: Mall;
  price: number;
  url: string;
}

interface FlatPriceListProps {
  results: ProductResult[];
}

function buildFlatListings(results: ProductResult[]): FlatListing[] {
  const listings: FlatListing[] = [];
  for (const r of results) {
    for (const p of r.prices) {
      if (p.price === null || p.availability === "unavailable") continue;
      listings.push({
        productName: r.name,
        jan: r.jan,
        asin: r.asin,
        imageUrl: r.imageUrl,
        mall: p.mall,
        price: p.price,
        url: p.url,
      });
    }
  }
  return listings.sort((a, b) => a.price - b.price);
}

export default function FlatPriceList({ results }: FlatPriceListProps) {
  const listings = buildFlatListings(results);

  if (listings.length === 0) {
    return (
      <div className="text-center py-16 text-gray-500">
        <p className="text-lg">価格情報が見つかりませんでした</p>
        <p className="text-sm mt-1">別のJANコードで試してください</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">
          安い順 — 全{listings.length}件
        </span>
        <span className="text-xs text-gray-400">複数JAN・全サイト合算</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-200">
              <th className="text-left py-2 px-3 font-medium w-6">#</th>
              <th className="text-left py-2 px-3 font-medium">商品</th>
              <th className="text-left py-2 px-3 font-medium">サイト</th>
              <th className="text-right py-2 px-3 font-medium">価格</th>
              <th className="text-center py-2 px-3 font-medium">リンク</th>
            </tr>
          </thead>
          <tbody>
            {listings.map((item, i) => (
              <tr
                key={i}
                className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  i === 0 ? "bg-green-50" : ""
                }`}
              >
                <td className="py-2.5 px-3 text-xs text-gray-400 font-medium">
                  {i === 0 ? (
                    <span className="text-green-600 font-bold">最安</span>
                  ) : (
                    `${i + 1}`
                  )}
                </td>
                <td className="py-2.5 px-3">
                  <div className="flex items-center gap-2">
                    {item.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.productName}
                        className="w-8 h-8 object-contain rounded bg-gray-50 border border-gray-100 flex-shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs text-gray-700 line-clamp-2 leading-snug">
                        {item.productName}
                      </p>
                      {item.jan && (
                        <span className="text-xs text-gray-400 font-mono">
                          JAN: {item.jan}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-2.5 px-3">
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: MALL_COLORS[item.mall] }}
                  >
                    {MALL_LABELS[item.mall]}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className={`text-sm font-bold ${i === 0 ? "text-green-700" : "text-gray-800"}`}>
                    ¥{item.price.toLocaleString()}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-center">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    商品ページ
                    <ExternalLink size={11} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
