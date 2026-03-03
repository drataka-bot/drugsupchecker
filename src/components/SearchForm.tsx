"use client";

import { useState } from "react";
import { SearchQuery } from "@/lib/types";

interface SearchFormProps {
  onSearch: (query: SearchQuery) => void;
  isLoading: boolean;
}

export default function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"discover" | "compare">("discover");

  /** カンマ・スペース・改行で分割して有効なコードを返す */
  const parseCodes = (value: string): string[] =>
    value.split(/[\s,、\n]+/).map((v) => v.trim()).filter(Boolean);

  const detectCodeType = (value: string): "jan" | "asin" | null => {
    const codes = parseCodes(value);
    if (codes.length === 0) return null;
    if (codes.every((c) => /^\d{8,13}$/.test(c))) return "jan";
    if (codes.every((c) => /^[A-Z0-9]{10}$/.test(c))) return "asin";
    return null;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    if (mode === "compare") {
      const codeType = detectCodeType(query);
      onSearch({ query: query.trim(), type: codeType ?? "name" });
    } else {
      onSearch({ query: query.trim(), type: "name" });
    }
  };

  const codes = parseCodes(query);
  const codeType = detectCodeType(query);

  const badge = (() => {
    if (!query) return null;
    if (mode === "discover") return "商品名";
    if (!codeType) return "商品名";
    const label = codeType === "jan" ? "JANコード" : "ASIN";
    return codes.length > 1 ? `${label} ×${codes.length}件` : label;
  })();

  const placeholder = mode === "discover"
    ? "商品名を入力（例：ビタミンC サプリ）"
    : "JANコード / ASIN（複数はカンマ区切り）";

  return (
    <div className="w-full space-y-2">
      {/* モード切り替えタブ */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          type="button"
          onClick={() => { setMode("discover"); setQuery(""); }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === "discover"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          🔍 商品を探す
        </button>
        <button
          type="button"
          onClick={() => { setMode("compare"); setQuery(""); }}
          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            mode === "compare"
              ? "bg-white text-blue-700 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          💰 価格を比較する
        </button>
      </div>

      {/* 検索フォーム */}
      <form onSubmit={handleSubmit} className="w-full">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full px-4 py-3 pr-32 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {badge && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded whitespace-nowrap">
                {badge}
              </span>
            )}
          </div>
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "検索中..." : "検索"}
          </button>
        </div>
      </form>
    </div>
  );
}
