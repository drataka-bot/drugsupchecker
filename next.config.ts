import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
// GitHub Pages のリポジトリ名に合わせて設定（例: /drugsupchecker）
// ユーザーページ (username.github.io) の場合は空文字にする
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? (isProd ? "/drugsupchecker" : "");

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
