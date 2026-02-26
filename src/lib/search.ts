import { ProductResult, SearchQuery } from "./types";
import { mockResults } from "./mockData";

export function searchProducts(query: SearchQuery): ProductResult[] {
  const q = query.query.trim().toLowerCase();

  return mockResults.filter((r) => {
    if (query.type === "jan") return r.jan?.includes(q);
    if (query.type === "asin") return r.asin?.toLowerCase().includes(q);
    return r.name.toLowerCase().includes(q);
  });
}
