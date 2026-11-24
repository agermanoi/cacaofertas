import type { Collector, OfferInput, Product } from "../types";
import { httpJson } from "../http";
import { toAffiliate } from "../affiliate";

/**
 * Mercado Livre via busca do Google (SerpAPI, engine "google").
 *
 * Em 23/11/2026 o ML fechou para apps comuns tudo que dava preço de terceiros: buy_box_winner veio
 * nulo em todos os produtos, e /products/{id}/items, /items/{id} e /sites/MLB/search passaram a
 * responder 403. A página do produto, acessada de servidor, cai numa verificação anti-robô.
 *
 * O Google continua mostrando as páginas de produto do ML com preço e estoque (rich snippet):
 *   "Fritadeira Airfryer Digital Philips Walita NA230/00" · R$ 380,00 · Em estoque
 * e o link é a própria página do ML (/p/MLB…), que recebe a etiqueta de afiliado normalmente.
 * Diferente do Google Shopping, que leva ao Google e não rende comissão.
 *
 * Cada produto gasta 1 busca da SerpAPI; o saldo é repartido em scripts/collect.ts (serpBudget).
 * O preço é o que o Google leu na página (pode ter algumas horas de atraso).
 * Env: SERPAPI_KEY (ou kv serpapi_key). Desligar: ML_GOOGLE=0.
 */

type Organic = {
  title?: string;
  link?: string;
  thumbnail?: string;
  rich_snippet?: { top?: { detected_extensions?: { price?: number }; extensions?: string[] }; bottom?: { detected_extensions?: { price?: number }; extensions?: string[] } };
};

const ESGOTADO = /fora de estoque|esgotado|indispon[ií]vel|sem estoque/i;

function mlId(link: string): string | null {
  const p = link.match(/mercadolivre\.com\.br\/(?:[^?#]*\/)?p\/(MLB\d+)/i);
  if (p) return p[1].toUpperCase();
  const i = link.match(/produto\.mercadolivre\.com\.br\/MLB-?(\d{6,})/i);
  return i ? `MLB${i[1]}` : null;
}

function affiliate(url: string): string | null {
  const tpl = process.env.ML_AFFILIATE_TEMPLATE;
  if (tpl) return tpl.replace("{url}", encodeURIComponent(url)).replace("{raw}", url);
  return toAffiliate(url);
}

export function mercadoLivreGoogle(): Collector {
  return {
    source: "mlgoogle",
    enabled: () => Boolean(process.env.SERPAPI_KEY) && process.env.ML_GOOGLE !== "0",
    async collect(product: Product): Promise<OfferInput[]> {
      const params = new URLSearchParams({
        engine: "google",
        q: `${product.query} site:mercadolivre.com.br`,
        gl: "br",
        hl: "pt-br",
        google_domain: "google.com.br",
        num: "10",
        api_key: process.env.SERPAPI_KEY!,
      });
      const json = await httpJson<{ organic_results?: Organic[]; error?: string }>(`https://serpapi.com/search.json?${params}`);
      if (json.error && !/hasn't returned any results/i.test(json.error)) throw new Error(`SerpAPI: ${json.error}`);

      const out: OfferInput[] = [];
      const seen = new Set<string>();
      for (const r of json.organic_results || []) {
        if (!r.link || !r.title) continue;
        const id = mlId(r.link);
        if (!id || seen.has(id)) continue;
        const rich = r.rich_snippet?.top || r.rich_snippet?.bottom;
        const price = Number(rich?.detected_extensions?.price || 0);
        if (!price) continue;
        if ((rich?.extensions || []).some((x) => ESGOTADO.test(x))) continue;
        seen.add(id);
        const url = r.link.split(/[?#]/)[0];
        out.push({
          source: "mlgoogle",
          store: "Mercado Livre",
          externalId: id,
          title: r.title.replace(/\s*\|\s*Mercado Livre.*$/i, "").replace(/\s*-\s*Mercado Livre.*$/i, "").trim(),
          url,
          affiliateUrl: affiliate(url),
          imageUrl: r.thumbnail || null,
          price,
          listPrice: null,
        });
      }
      return out;
    },
  };
}
