import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "価格チェッカー",
  description: "Amazon基準で各モールの価格を比較するツール",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
