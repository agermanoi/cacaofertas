import type { Collector, OfferInput, Product } from "../types";
import { httpJson, parsePrice } from "../http";
import { toAffiliate } from "../affiliate";

/**
 * Google Shopping via SerpAPI — compara várias lojas numa consulta.
 * 1 busca por produto. O consumo é controlado em scripts/collect.ts (serpBudget):
 * cada coleta usa só a sua parte do saldo do mês, priorizando os produtos
 * consultados há mais tempo.
 * Env: SERPAPI_KEY
 */

/** Saldo de buscas da conta (null se não der para consultar). */
export async function serpApiSearchesLeft(): Promise<number | null> {
  try {
    const a = await httpJson<{ total_searches_left?: number; plan_searches_left?: number }>(
      `https://serpapi.com/account.json?api_key=${encodeURIComponent(process.env.SERPAPI_KEY || "")}`
    );
    const n = a.total_searches_left ?? a.plan_searches_left;
    return typeof n === "number" ? n : null;
  } catch {
    return null;
  }
}

/** Amostra das lojas e domínios devolvidos, para diagnóstico no painel. */
export const serpSample: { store: string; host: string }[] = [];
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
          if (serpSample.length < 30) {
            let host = "";
            try {
              host = new URL(url).hostname;
            } catch {}
            serpSample.push({ store, host });
          }
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
