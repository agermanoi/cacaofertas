import type { Collector, OfferInput, Product } from "../types";
import { httpJson, http, sleep } from "../http";
import { storeFromUrl } from "../affiliate";
import { titleMatches } from "../match";

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

/**
 * A busca da Lomadee casa QUALQUER palavra ("smart tv lg 43" traz "Armário Atlanta Smart"),
 * então buscamos primeiro pelo termo mais específico (código do modelo) e filtramos pelo título.
 */
export function lomadeeQueries(product: Pick<Product, "query" | "must">): string[] {
  const must = product.must || [];
  const codes = must.filter((t) => t.startsWith("~")).map((t) => t.split("|")[0].slice(1));
  const words = must
    .map((t) => t.split("|")[0])
    .filter((t) => !t.startsWith("~") && !/^\d+$/.test(t.trim()))
    .sort((a, b) => b.length - a.length);
  const out = [...codes, words.slice(0, 2).join(" "), product.query];
  return [...new Set(out.map((q) => q.trim()).filter((q) => q.length > 2))];
}

export function lomadee(): Collector {
  const rejected: Record<string, string[]> = {};
  return {
    source: "lomadee",
    rejected,
    enabled: () => Boolean(process.env.LOMADEE_API_KEY),
    async collect(product: Product): Promise<OfferInput[]> {
      const out: OfferInput[] = [];
      const seen = new Set<string>();
      const refused: string[] = [];
      delete rejected[product.slug];

      for (const q of lomadeeQueries(product)) {
        const params = new URLSearchParams({ search: q, limit: "100", isAvailable: "true" });
        const min = Math.round(Number(product.min_price || 0) * 100);
        const max = product.max_price ? Math.round(Number(product.max_price) * 100) : 100_000_000;
        if (min > 0) params.set("price", `${min}:${max}`);

        const json = await httpJson<{ data: any[] }>(`${base()}/affiliate/products?${params}`, { headers: headers() });
        await sleep(1100); // respeita 60 req/min

        for (const p of json.data || []) {
          const opt = (p.options || []).find((o: any) => o.available) || p.options?.[0];
          const pricing = opt?.pricing?.[0];
          const title = String(opt?.name || p.name || "");
          if (!pricing?.price || !p.url || !title) continue;
          const externalId = `${p.organizationId}:${p.id}`;
          if (seen.has(externalId)) continue;
          seen.add(externalId);
          if (!titleMatches(product, title)) {
            if (refused.length < 6) refused.push(`${title} (busca "${q}")`);
            continue;
          }
          out.push({
            source: "lomadee",
            store: storeFromUrl(p.url),
            externalId,
            title,
            url: String(p.url),
            affiliateUrl: null, // gerado sob demanda por lomadeeAffiliateLink()
            imageUrl: opt?.images?.[0]?.url || p.images?.[0]?.url || null,
            price: pricing.price / 100,
            listPrice: pricing.listPrice ? pricing.listPrice / 100 : null,
            meta: { organizationId: String(p.organizationId) },
          });
        }
        if (out.length) break;
      }
      if (!out.length && refused.length) rejected[product.slug] = refused;
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
