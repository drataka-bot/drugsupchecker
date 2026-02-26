"use client";

import { useState } from "react";
import { SearchQuery } from "@/lib/types";

interface SearchFormProps {
  onSearch: (query: SearchQuery) => void;
  isLoading: boolean;
}

export default function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<SearchQuery["type"]>("name");

  const detectType = (value: string): SearchQuery["type"] => {
    if (/^\d{13}$/.test(value.trim())) return "jan";
    if (/^[A-Z0-9]{10}$/.test(value.trim())) return "asin";
    return "name";
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setType(detectType(value));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    onSearch({ query: query.trim(), type });
  };

  const typeLabel: Record<SearchQuery["type"], string> = {
    jan: "JANコード",
    asin: "ASIN",
    name: "商品名",
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="JANコード / ASIN / 商品名を入力"
            className="w-full px-4 py-3 pr-24 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          {query && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              {typeLabel[type]}
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
  );
}
