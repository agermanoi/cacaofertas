import type { Collector, OfferInput, Product } from "../types";
import { httpJson, http, sleep } from "../http";
import { storeFromUrl } from "../affiliate";

/**
 * Lomadee (rede de afiliados) — catálogo de produtos das lojas parceiras.
 * Docs: https://docs.lomadee.com.br/api-reference/introduction
 * Limite: 60 req/min por chave. Preços vêm em centavos.
 *
 * Env: LOMADEE_API_KEY (escopos products:read e shortener:write)
 *      LOMADEE_API_URL (opcional, padrão https://api.lomadee.com.br)
 */
const base = () => (process.env.LOMADEE_API_URL || "https://api.lomadee.com.br").replace(/\/$/, "");
const headers = () => ({ "x-api-key": process.env.LOMADEE_API_KEY!, "content-type": "application/json" });

export function lomadee(): Collector {
  return {
    source: "lomadee",
    enabled: () => Boolean(process.env.LOMADEE_API_KEY),
    async collect(product: Product): Promise<OfferInput[]> {
      const params = new URLSearchParams({ search: product.query, limit: "50", isAvailable: "true" });
      const min = Math.round(Number(product.min_price || 0) * 100);
      const max = product.max_price ? Math.round(Number(product.max_price) * 100) : 100_000_000;
      if (min > 0) params.set("price", `${min}:${max}`);

      const json = await httpJson<{ data: any[] }>(`${base()}/affiliate/products?${params}`, { headers: headers() });
      await sleep(1100); // respeita 60 req/min

      const out: OfferInput[] = [];
      for (const p of json.data || []) {
        const opt = (p.options || []).find((o: any) => o.available) || p.options?.[0];
        const pricing = opt?.pricing?.[0];
        if (!pricing?.price || !p.url) continue;
        out.push({
          source: "lomadee",
          store: storeFromUrl(p.url),
          externalId: `${p.organizationId}:${p.id}`,
          title: String(opt?.name || p.name),
          url: String(p.url),
          affiliateUrl: null, // gerado sob demanda por lomadeeAffiliateLink()
          imageUrl: opt?.images?.[0]?.url || p.images?.[0]?.url || null,
          price: pricing.price / 100,
          listPrice: pricing.listPrice ? pricing.listPrice / 100 : null,
          meta: { organizationId: String(p.organizationId) },
        });
      }
      return out;
    },
  };
}

/** Gera o link curto de afiliado (lmdee.link). Chamado só para ofertas novas. */
export async function lomadeeAffiliateLink(organizationId: string, url: string): Promise<string | null> {
  try {
    const res = await http(`${base()}/affiliate/shortener/url`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ organizationId, type: "Custom", url, mdasc: process.env.LOMADEE_MDASC || undefined }),
    });
    const json = (await res.json()) as { shortUrls?: string[] }[];
    await sleep(1100);
    return json?.[0]?.shortUrls?.[0] ?? null;
  } catch (e) {
    console.warn(`[lomadee] não gerou link de afiliado: ${(e as Error).message}`);
    return null;
  }
}
