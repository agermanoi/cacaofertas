import type { Collector, OfferInput, Product } from "../types";
import { httpJson, parsePrice } from "../http";
import { toAffiliate } from "../affiliate";

/**
 * Google Shopping via SerpAPI — compara várias lojas numa consulta.
 * 1 busca por produto por coleta. Com 24 produtos/dia ≈ 720 buscas/mês.
 * Env: SERPAPI_KEY
 */
export function serpApi(): Collector {
  return {
    source: "serpapi",
    enabled: () => Boolean(process.env.SERPAPI_KEY),
    async collect(product: Product): Promise<OfferInput[]> {
      const params = new URLSearchParams({
        engine: "google_shopping",
        q: product.query,
        gl: "br",
        hl: "pt-br",
        google_domain: "google.com.br",
        location: "Brazil",
        api_key: process.env.SERPAPI_KEY!,
      });
      const json = await httpJson<{ shopping_results?: any[]; error?: string }>(
        `https://serpapi.com/search.json?${params}`
      );
      if (json.error) throw new Error(`SerpAPI: ${json.error}`);

      return (json.shopping_results || [])
        .map((r): OfferInput | null => {
          const price = r.extracted_price ?? parsePrice(r.price);
          const url: string | undefined = r.link || r.product_link;
          if (!price || !url) return null;
          const store = String(r.source || "Loja").trim();
          return {
            source: "serpapi",
            store,
            externalId: String(r.product_id ? `${r.product_id}:${store}` : url),
            title: String(r.title),
            url,
            affiliateUrl: r.link ? toAffiliate(r.link) : null,
            imageUrl: r.thumbnail || null,
            price: Number(price),
            listPrice: r.extracted_old_price ?? parsePrice(r.old_price),
          };
        })
        .filter((o): o is OfferInput => o !== null);
    },
  };
}
