import type { Collector, OfferInput, Product } from "../types";
import { httpJson } from "../http";
import { toAffiliate } from "../affiliate";
import { titleMatches } from "../match";

/**
 * Amazon Brasil via SerpAPI (engine=amazon).
 * Traz o link direto do produto (amazon.com.br/dp/ASIN), que recebe o código de
 * afiliado (AMAZON_ASSOCIATE_TAG). 1 busca por produto; o consumo é controlado
 * em scripts/collect.ts (serpBudget).
 *
 * Quando a conta liberar a Creators API (API oficial), este coletor pode ser
 * trocado por ela sem mudar o resto do site.
 *
 * Env: SERPAPI_KEY, AMAZON_ASSOCIATE_TAG
 */

const NOT_NEW = /renovad|recondicionad|seminovo|usado|vitrine|reembalad/i;

export function amazonSerp(): Collector {
  const rejected: Record<string, string[]> = {};
  return {
    source: "amazon",
    rejected,
    enabled: () => Boolean(process.env.SERPAPI_KEY) && process.env.AMAZON_SERPAPI !== "0",
    async collect(product: Product): Promise<OfferInput[]> {
      const params = new URLSearchParams({
        engine: "amazon",
        amazon_domain: "amazon.com.br",
        k: product.query,
        api_key: process.env.SERPAPI_KEY!,
      });
      const json = await httpJson<{ organic_results?: any[]; error?: string }>(
        `https://serpapi.com/search.json?${params}`
      );
      if (json.error && !/hasn't returned any results/i.test(json.error)) throw new Error(`SerpAPI Amazon: ${json.error}`);

      const out: OfferInput[] = [];
      const refused: string[] = [];
      const seen = new Set<string>();
      for (const r of json.organic_results || []) {
        const asin = String(r.asin || "");
        const title = String(r.title || "");
        const price = Number(r.extracted_price);
        if (!asin || !title || !price || seen.has(asin)) continue;
        seen.add(asin);
        if (NOT_NEW.test(title) || !titleMatches(product, title)) {
          if (refused.length < 6) refused.push(title.slice(0, 140));
          continue;
        }
        const url = `https://www.amazon.com.br/dp/${asin}`;
        const old = Number(r.extracted_old_price);
        out.push({
          source: "amazon",
          store: "Amazon",
          externalId: asin,
          title,
          url,
          affiliateUrl: toAffiliate(url),
          imageUrl: r.thumbnail || null,
          price,
          listPrice: old && old > price ? old : null,
        });
      }
      if (!out.length && refused.length) rejected[product.slug] = refused;
      else delete rejected[product.slug];
      return out;
    },
  };
}
