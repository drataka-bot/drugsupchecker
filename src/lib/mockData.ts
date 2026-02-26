import { ProductResult } from "./types";

export const mockResults: ProductResult[] = [
  {
    jan: "4549660527336",
    asin: "B08XYZ1234",
    name: "Sony WH-1000XM5 ワイヤレスノイズキャンセリングヘッドホン",
    imageUrl: "https://placehold.co/120x120/eee/999?text=Sony+WH1000XM5",
    amazonPrice: 38500,
    prices: [
      { mall: "amazon", price: 38500, url: "#", availability: "available" },
      { mall: "rakuten", price: 36800, url: "#", availability: "available", shipping: 0 },
      { mall: "yahoo", price: 37200, url: "#", availability: "available", shipping: 0 },
      { mall: "biccamera", price: 44000, url: "#", availability: "available", shipping: 0 },
      { mall: "yodobashi", price: 43780, url: "#", availability: "available", shipping: 0 },
      { mall: "aupay", price: 35900, url: "#", availability: "available", shipping: 550 },
    ],
  },
  {
    jan: "4549576197883",
    asin: "B09ABCD5678",
    name: "Apple AirPods Pro (第2世代)",
    imageUrl: "https://placehold.co/120x120/eee/999?text=AirPods+Pro",
    amazonPrice: 32800,
    prices: [
      { mall: "amazon", price: 32800, url: "#", availability: "available" },
      { mall: "rakuten", price: 29800, url: "#", availability: "available", shipping: 0 },
      { mall: "yahoo", price: 30500, url: "#", availability: "available", shipping: 0 },
      { mall: "biccamera", price: 33800, url: "#", availability: "available", shipping: 0 },
      { mall: "yodobashi", price: 33800, url: "#", availability: "available", shipping: 0 },
      { mall: "aupay", price: null, url: "#", availability: "unavailable" },
    ],
  },
  {
    jan: "4902370550498",
    asin: "B0CEFGH9012",
    name: "Nintendo Switch (有機ELモデル) ホワイト",
    imageUrl: "https://placehold.co/120x120/eee/999?text=Switch+OLED",
    amazonPrice: 37980,
    prices: [
      { mall: "amazon", price: 37980, url: "#", availability: "available" },
      { mall: "rakuten", price: 39800, url: "#", availability: "available", shipping: 0 },
      { mall: "yahoo", price: 38500, url: "#", availability: "available", shipping: 0 },
      { mall: "biccamera", price: 37980, url: "#", availability: "available", shipping: 0 },
      { mall: "yodobashi", price: 37980, url: "#", availability: "available", shipping: 0 },
      { mall: "aupay", price: 41800, url: "#", availability: "available", shipping: 0 },
    ],
  },
];
