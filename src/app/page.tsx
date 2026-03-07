"use client";

import { useState, useEffect } from "react";
import SearchForm from "@/components/SearchForm";
import PriceTable from "@/components/PriceTable";
import ProductPickerCard from "@/components/ProductPickerCard";
import FlatPriceList from "@/components/FlatPriceList";
import { ProductResult, SearchQuery } from "@/lib/types";

const FAVORITES_KEY = "drugsup_favorites";

function loadFavorites(): ProductResult[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(favs: ProductResult[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
}

function isSameProduct(a: ProductResult, b: ProductResult): boolean {
  if (a.asin && b.asin) return a.asin === b.asin;
  if (a.jan && b.jan) return a.jan === b.jan;
  return a.name === b.name;
}

export default function Home() {
  const [results, setResults] = useState<ProductResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(10);
  const [tab, setTab] = useState<"search" | "favorites">("search");
  const [favorites, setFavorites] = useState<ProductResult[]>([]);
  const [searchMeta, setSearchMeta] = useState<{
    mode: "discover" | "compare";
    rakuten: { total: number; shown: number; hasMore: boolean };
    yahoo: { total: number; shown: number; hasMore: boolean };
    page: number;
    hasMore: boolean;
    source?: string;
    totalHits?: number;
    totalShown?: number;
    sort?: string | null;
    janCount?: number;
  } | null>(null);
  const [currentQuery, setCurrentQuery] = useState<SearchQuery | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMultiSearch, setIsMultiSearch] = useState(false);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  const handleSearch = async (query: SearchQuery) => {
    setIsLoading(true);
    setError(null);
    setSearched(false);
    setTab("search");
    setSearchMeta(null);
    setCurrentQuery(query);
    setIsMultiSearch(false);

    try {
      // 複数コード（JAN/ASIN）を並列検索
      if (query.type === "jan" || query.type === "asin") {
        const codes = query.query
          .split(/[\s,、\n]+/)
          .map((v) => v.trim())
          .filter(Boolean);

        if (codes.length > 1) {
          const targets = codes.slice(0, 10); // 最大10件
          const searches = targets.map((code) =>
            fetch(`/api/search?${new URLSearchParams({ query: code, type: query.type })}`)
              .then((r) => r.json())
              .catch(() => ({ results: [] }))
          );
          const responses = await Promise.allSettled(searches);
          const allResults: ProductResult[] = responses.flatMap((r) =>
            r.status === "fulfilled" ? (r.value.results ?? []) : []
          );
          setResults(allResults);
          setSearchMeta({
            mode: "compare",
            rakuten: { total: 0, shown: 0, hasMore: false },
            yahoo: { total: 0, shown: 0, hasMore: false },
            page: 1,
            hasMore: false,
          });
          setIsMultiSearch(true);
          setSearched(true);
          return;
        }
      }

      // 単一検索
      const params = new URLSearchParams({ query: query.query, type: query.type });
      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "検索に失敗しました");
      }
      const { results: found, meta } = await res.json();
      setResults(found);
      setSearchMeta(meta ?? null);
      setSearched(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsLoading(false);
    }
  };

  // discover モードで「価格を比較する」ボタンを押したとき
  const handleCompareFromDiscover = (result: ProductResult) => {
    const code = result.jan || result.asin;
    if (code) {
      const type: SearchQuery["type"] = result.jan ? "jan" : "asin";
      handleSearch({ query: code, type });
    } else {
      // JAN/ASIN不明 → 商品名でキーワード比較
      handleSearch({ query: result.name, type: "keyword" });
    }
  };

  const handleLoadMore = async () => {
    if (!currentQuery || !searchMeta || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = searchMeta.page + 1;
      const params = new URLSearchParams({ query: currentQuery.query, type: currentQuery.type, page: String(nextPage) });
      const res = await fetch(`/api/search?${params}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "読み込みに失敗しました");
      }
      const { results: more, meta } = await res.json();
      setResults((prev) => [...prev, ...more]);
      setSearchMeta(meta ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleToggleFavorite = (result: ProductResult) => {
    setFavorites((prev) => {
      const exists = prev.some((f) => isSameProduct(f, result));
      const next = exists
        ? prev.filter((f) => !isSameProduct(f, result))
        : [...prev, result];
      saveFavorites(next);
      return next;
    });
  };

  const isDiscoverMode = searchMeta?.mode === "discover";
  const displayResults = tab === "favorites" ? favorites : results;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">価格チェッカー</h1>
              <p className="text-xs text-gray-500 mt-0.5">複数モールの価格を比較・利益計算</p>
            </div>
            {/* ハイライト閾値設定（比較モードのみ） */}
            {!isDiscoverMode && (
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
            )}
          </div>
          <SearchForm onSearch={handleSearch} isLoading={isLoading} />

          {/* タブ */}
          <div className="flex gap-1 mt-3">
            <button
              onClick={() => setTab("search")}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                tab === "search"
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {isDiscoverMode ? "🔍 検索結果" : "検索結果"}
              {searched && results.length > 0 && (
                <span className="ml-1.5 text-xs opacity-75">({results.length})</span>
              )}
            </button>
            <button
              onClick={() => setTab("favorites")}
              className={`px-4 py-1.5 text-sm rounded-full transition-colors ${
                tab === "favorites"
                  ? "bg-red-500 text-white"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              ❤ お気に入り
              {favorites.length > 0 && (
                <span className="ml-1.5 text-xs opacity-75">({favorites.length})</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* ローディング */}
        {isLoading && (
          <div className="text-center py-16">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-3 text-gray-500 text-sm">
              {currentQuery?.type === "name" ? "商品を検索中..." : "各モールを検索中..."}
            </p>
          </div>
        )}

        {/* エラー */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* お気に入りタブ: 空状態 */}
        {tab === "favorites" && favorites.length === 0 && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-4">❤</p>
            <p className="text-lg font-medium text-gray-500">お気に入りがありません</p>
            <p className="text-sm mt-2">商品カードのハートボタンで追加できます</p>
          </div>
        )}

        {/* 検索件数バッジ（比較モードのみ） */}
        {tab === "search" && !isLoading && searched && searchMeta && !isDiscoverMode && (
          <div className="flex flex-wrap gap-2 mb-3 text-xs">
            <span className="bg-pink-50 border border-pink-200 text-pink-700 px-2.5 py-1 rounded-full">
              楽天: {searchMeta.rakuten.shown}件表示 / 約{searchMeta.rakuten.total.toLocaleString()}件ヒット
            </span>
            {searchMeta.yahoo.total > 0 ? (
              <span className="bg-purple-50 border border-purple-200 text-purple-700 px-2.5 py-1 rounded-full">
                Yahoo: {searchMeta.yahoo.shown}件表示 / 約{searchMeta.yahoo.total.toLocaleString()}件ヒット
              </span>
            ) : (
              <span className="bg-gray-50 border border-gray-200 text-gray-400 px-2.5 py-1 rounded-full">
                Yahoo: 未設定（YAHOO_APP_IDを.env.localに設定してください）
              </span>
            )}
          </div>
        )}

        {/* 凡例（比較モードのみ） */}
        {!isLoading && !isDiscoverMode && displayResults.length > 0 && tab !== "favorites" && (
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

        {/* お気に入りタブ: 比較カード表示 */}
        {tab === "favorites" && favorites.length > 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-gray-500">{favorites.length}件</p>
            {favorites.map((result, i) => (
              <PriceTable
                key={i}
                result={result}
                thresholdPercent={threshold}
                isFavorited={true}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
          </div>
        )}

        {/* 検索結果 */}
        {!isLoading && tab === "search" && (
          <>
            {/* discover モード: 商品グリッド */}
            {isDiscoverMode && searched && (
              results.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-lg">商品が見つかりませんでした</p>
                  <p className="text-sm mt-1">別のキーワードで試してください</p>
                </div>
              ) : (
                <div>
                  {searchMeta?.source === "demo" && (
                    <div className="mb-3 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
                      ⚠️ <strong>デモデータを表示しています。</strong>
                      実際の検索には <code className="bg-yellow-100 px-1 rounded">KEEPA_API_KEY</code> または <code className="bg-yellow-100 px-1 rounded">YAHOO_APP_ID</code> の設定が必要です。
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mb-3 text-sm text-gray-500">
                    <span>
                      <strong className="text-gray-700">{results.length}件</strong> 表示
                      {searchMeta?.totalHits != null && searchMeta.totalHits > results.length && (
                        <span className="text-gray-400">（全{searchMeta.totalHits.toLocaleString()}件中）</span>
                      )}
                    </span>
                    {searchMeta?.janCount != null && searchMeta.janCount < results.length && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span className="text-xs text-green-600">JAN確定 {searchMeta.janCount}件</span>
                      </>
                    )}
                    {searchMeta?.sort && searchMeta.sort !== "デモデータ" && (
                      <>
                        <span className="text-gray-300">|</span>
                        <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{searchMeta.sort}</span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {results.map((result, i) => (
                      <ProductPickerCard
                        key={i}
                        result={result}
                        onCompare={handleCompareFromDiscover}
                      />
                    ))}
                  </div>
                  {searchMeta?.hasMore && (
                    <button
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="w-full mt-4 py-3 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                    >
                      {isLoadingMore ? "読み込み中..." : "もっと見る"}
                    </button>
                  )}
                </div>
              )
            )}

            {/* compare モード: 価格テーブル or 複数JAN安い順リスト */}
            {!isDiscoverMode && (
              displayResults.length === 0 && searched ? (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-lg">商品が見つかりませんでした</p>
                  <p className="text-sm mt-1">別のキーワードやJANコードで試してください</p>
                </div>
              ) : isMultiSearch ? (
                // 複数JAN: 全サイト合算で安い順フラットリスト
                <FlatPriceList results={displayResults} />
              ) : (
                <div className="flex flex-col gap-4">
                  {displayResults.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-500">
                      <span><strong className="text-gray-700">{displayResults.length}件</strong> の比較結果</span>
                      {(searchMeta?.rakuten.total ?? 0) > 0 && <span className="text-xs text-gray-400">楽天 {searchMeta!.rakuten.total}件</span>}
                      {(searchMeta?.yahoo.total ?? 0) > 0 && <span className="text-xs text-gray-400">Yahoo {searchMeta!.yahoo.total}件</span>}
                    </div>
                  )}
                  {displayResults.map((result, i) => (
                    <PriceTable
                      key={i}
                      result={result}
                      thresholdPercent={threshold}
                      isFavorited={favorites.some((f) => isSameProduct(f, result))}
                      onToggleFavorite={handleToggleFavorite}
                    />
                  ))}
                  {searchMeta?.hasMore && (
                    <button
                      onClick={handleLoadMore}
                      disabled={isLoadingMore}
                      className="w-full py-3 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
                    >
                      {isLoadingMore ? "読み込み中..." : "もっと見る"}
                    </button>
                  )}
                </div>
              )
            )}
          </>
        )}

        {/* 初期状態 */}
        {tab === "search" && !searched && !isLoading && (
          <div className="text-center py-16 text-gray-400">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-lg font-medium text-gray-500">商品を検索してください</p>
            <p className="text-sm mt-2 max-w-sm mx-auto">
              <strong>商品を探す</strong>: 商品名で検索してJAN/ASINを確認<br />
              <strong>価格を比較する</strong>: JAN・ASINで各モールの価格を比較
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
