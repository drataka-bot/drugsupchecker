"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import {
  OVERSEAS_SITES,
  REGIONS,
  REGION_LABELS,
  OverseasRegion,
} from "@/lib/overseasSites";
import { ProductResult } from "@/lib/types";

interface OverseasSearchProps {
  result: ProductResult;
}

function RegionSection({
  region,
  result,
}: {
  region: OverseasRegion;
  result: ProductResult;
}) {
  const sites = OVERSEAS_SITES.filter((s) => s.region === region);

  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 mb-2">
        {REGION_LABELS[region]}
      </p>
      <div className="flex flex-wrap gap-2">
        {sites.map((site) => {
          const url = site.buildUrl({
            name: result.name,
            jan: result.jan,
            asin: result.asin,
          });
          return (
            <a
              key={site.id}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white hover:opacity-80 transition-opacity"
              style={{ backgroundColor: site.color }}
            >
              {site.name}
              <ExternalLink size={10} />
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default function OverseasSearch({ result }: OverseasSearchProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t border-gray-100">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span className="flex items-center gap-2 font-medium">
          🌍 海外ECサイトで検索
          <span className="text-xs font-normal text-gray-400">
            {result.asin ? "ASIN対応" : "商品名で検索"}
          </span>
        </span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-4 bg-gray-50">
          {REGIONS.map((region) => (
            <RegionSection key={region} region={region} result={result} />
          ))}
          <p className="text-xs text-gray-400">
            ※ 各サイトで商品名{result.jan ? "・JANコード" : ""}
            {result.asin ? "・ASIN" : ""}を使って検索結果を開きます
          </p>
        </div>
      )}
    </div>
  );
}
