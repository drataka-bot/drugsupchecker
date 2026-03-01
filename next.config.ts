import type { NextConfig } from "next";

// NEXT_PUBLIC_BASE_PATH が設定されている場合 = GitHub Pages ビルド (静的エクスポート)
// 設定されていない場合 = Vercel ビルド (APIルート有効)
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(basePath ? { output: "export", basePath } : {}),
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
