"use client";

import { useState } from "react";
import SearchForm from "@/components/SearchForm";
import PriceTable from "@/components/PriceTable";
import { ProductResult, SearchQuery } from "@/lib/types";

export default function Home() {
  const [results, setResults] = useState<ProductResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(10);

  const handleSearch = async (query: SearchQuery) => {
    setIsLoading(true);
    setError(null);
    setSearched(false);

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(query.query)}&type=${query.type}`
      );
      if (!res.ok) throw new Error("検索に失敗しました");
      const data = await res.json();
      setResults(data.results);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">電脳せどりチェッカー</h1>
              <p className="text-xs text-gray-500 mt-0.5">Amazon基準で各モールの価格を比較</p>
            </div>
            {/* ハイライト閾値設定 */}
            <div className="flex items-center gap-2 text-sm">
              <label className="text-gray-600 whitespace-nowrap">ハイライト</label>
              <select
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={5}>5%以上</option>
                <option value={10}>10%以上</option>
                <option value={15}>15%以上</option>
                <option value={20}>20%以上</option>
              </select>
            </div>
          </div>
          <SearchForm onSearch={handleSearch} isLoading={isLoading} />
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* ローディング */}
        {isLoading && (
          <div className="text-center py-16">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-gray-500 text-sm">各モールを検索中...</p>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 凡例 */}
        {searched && !isLoading && results.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-4 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300" />
              Amazonより{threshold}%以上安い
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" />
              Amazonより{threshold}%以上高い
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded bg-orange-50 border border-orange-200" />
              Amazon基準価格
            </span>
          </div>
        )}

        {/* 結果 */}
        {!isLoading && searched && (
          results.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg">商品が見つかりませんでした</p>
              <p className="text-sm mt-1">別のキーワードやJANコードで試してください</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-gray-500">{results.length}件の商品が見つかりました</p>
              {results.map((result, i) => (
                <PriceTable key={i} result={result} thresholdPercent={threshold} />
              ))}
            </div>
          )
        )}

        {/* 初期状態 */}
        {!searched && !isLoading && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-lg font-medium text-gray-500">商品を検索してください</p>
            <p className="text-sm mt-2 max-w-sm mx-auto">
              JANコード（13桁）・ASIN・商品名を入力すると<br />
              各モールの価格を比較します
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
