import type { SupabaseClient } from "@supabase/supabase-js";
import type { Collector, OfferInput, Product } from "../types";
import { httpJson, http, HttpError, sleep } from "../http";
import { toAffiliate } from "../affiliate";
import { titleMatches } from "../match";

/**
 * Mercado Livre: API oficial, via CATÁLOGO.
 *
 * A busca de anúncios (/sites/MLB/search) passou a responder 403 para apps comuns.
 * Usamos então o catálogo, que segue liberado com token de usuário:
 *   1) GET /products/search?site_id=MLB&status=active&q=...   -> produtos de catálogo
 *   2) GET /products/{id}                                      -> buy_box_winner (preço de quem vende agora)
 *   3) GET /products/{id}/items                                -> demais ofertas do mesmo produto (se liberado)
 *
 * O token dura 6h e o refresh token é de uso único: a cada renovação
 * o novo refresh token é salvo na tabela `kv` do Supabase.
 *
 * Env: ML_CLIENT_ID, ML_CLIENT_SECRET
 *      ML_AFFILIATE_TEMPLATE (opcional: link do programa de afiliados com {url})
 *      ML_CATALOG_PRODUCTS (opcional: quantos produtos do catálogo examinar por item, padrão 4)
 */

const API = "https://api.mercadolibre.com";
const KV_KEY = "ml_refresh_token";
const PER_QUERY = Number(process.env.ML_CATALOG_PRODUCTS || 4);

interface CatalogHit {
  id: string;
  name: string;
  pictures?: { url?: string }[];
}

interface CatalogDetail {
  id: string;
  name: string;
  permalink?: string;
  pictures?: { url?: string }[];
  buy_box_winner?: {
    item_id?: string;
    price?: number;
    original_price?: number | null;
    condition?: string;
  } | null;
}

interface CatalogItem {
  item_id?: string;
  price?: number;
  original_price?: number | null;
  condition?: string;
}

function itemUrl(itemId: string): string {
  const m = itemId.match(/^([A-Z]+)(\d+)$/);
  return m ? `https://produto.mercadolivre.com.br/${m[1]}-${m[2]}` : `https://www.mercadolivre.com.br/p/${itemId}`;
}

/** Busca principal + buscas curtas de reserva (termos obrigatórios, sem "~" e com a 1ª alternativa). */
export function searchQueries(product: Pick<Product, "query" | "must">): string[] {
  const terms = (product.must || []).map((t) => t.split("|")[0].replace(/^~/, "").trim()).filter(Boolean);
  const head = product.query.split(" ").slice(0, 3);
  const short = [...new Set([...head, ...terms.flatMap((t) => t.split(" "))])].join(" ");
  const codes = (product.must || []).filter((t) => t.startsWith("~")).map((t) => t.split("|")[0].slice(1));
  const out = [product.query, short, codes.length ? `${head.join(" ")} ${codes.join(" ")}` : ""];
  return [...new Set(out.map((q) => q.trim()).filter((q) => q.length > 2))];
}

export function mercadoLivre(db: SupabaseClient): Collector {
  let accessToken: string | null = null;
  let itemsEndpointBlocked = false;
  const rejected: Record<string, string[]> = {};

  async function getToken(): Promise<string> {
    if (accessToken) return accessToken;
    const { data } = await db.from("kv").select("value").eq("key", KV_KEY).maybeSingle();
    const refresh = data?.value || process.env.ML_REFRESH_TOKEN;
    if (!refresh) throw new Error("Mercado Livre não conectado. Use o painel: Mercado Livre → Conectar.");

    const res = await http(`${API}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.ML_CLIENT_ID!,
        client_secret: process.env.ML_CLIENT_SECRET!,
        refresh_token: refresh,
      }),
    });
    const json = (await res.json()) as { access_token: string; refresh_token: string };
    accessToken = json.access_token;
    await db.from("kv").upsert({ key: KV_KEY, value: json.refresh_token, updated_at: new Date().toISOString() });
    return accessToken;
  }

  function affiliate(url: string): string | null {
    const tpl = process.env.ML_AFFILIATE_TEMPLATE;
    if (tpl) return tpl.replace("{url}", encodeURIComponent(url)).replace("{raw}", url);
    return toAffiliate(url);
  }

  /** GET com token; espera e tenta de novo quando o ML limita a taxa (429). */
  async function get<T>(path: string): Promise<T> {
    const token = await getToken();
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await httpJson<T>(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
        await sleep(350); // ~3 req/s: abaixo do limite do ML
        return r;
      } catch (e) {
        if (e instanceof HttpError && e.status === 429 && attempt < 3) {
          await sleep(5000 * (attempt + 1));
          continue;
        }
        throw e;
      }
    }
  }

  return {
    source: "mercadolivre",
    rejected,
    enabled: () => Boolean(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET),
    async collect(product: Product): Promise<OfferInput[]> {
      // A busca do catálogo varia de uma chamada para outra. Se a busca principal não trouxer
      // o modelo, tenta de novo com uma busca curta montada com os termos obrigatórios.
      const hits: CatalogHit[] = [];
      const refused: string[] = [];
      const seenHits = new Set<string>();
      for (const q of searchQueries(product)) {
        const params = new URLSearchParams({ site_id: "MLB", status: "active", q, limit: "50" });
        let results: CatalogHit[] = [];
        try {
          results = (await get<{ results?: CatalogHit[] }>(`/products/search?${params}`)).results || [];
        } catch (e) {
          if (!hits.length && q === product.query) throw e;
          continue;
        }
        for (const h of results) {
          if (seenHits.has(h.id)) continue;
          seenHits.add(h.id);
          if (titleMatches(product, h.name)) hits.push(h);
          else refused.push(h.name);
        }
        if (hits.length) break;
      }
      hits.splice(PER_QUERY);
      if (!hits.length && refused.length) rejected[product.slug] = refused.slice(0, 6);
      else delete rejected[product.slug];

      const out: OfferInput[] = [];
      for (const hit of hits) {
        let detail: CatalogDetail;
        try {
          detail = await get<CatalogDetail>(`/products/${hit.id}`);
        } catch {
          continue;
        }
        const image = detail.pictures?.[0]?.url || hit.pictures?.[0]?.url || null;
        const productUrl = detail.permalink || `https://www.mercadolivre.com.br/p/${hit.id}`;
        const title = detail.name || hit.name;

        // Outras ofertas do mesmo produto (algumas contas não têm acesso: aí fica só o buy box)
        let items: CatalogItem[] = [];
        if (!itemsEndpointBlocked) {
          try {
            const r = await get<{ results?: CatalogItem[] }>(`/products/${hit.id}/items?limit=10`);
            items = r.results || [];
          } catch (e) {
            if (e instanceof HttpError && (e.status === 403 || e.status === 401)) itemsEndpointBlocked = true;
          }
        }

        const bb = detail.buy_box_winner;
        if (bb?.price && bb.item_id) {
          items = [{ item_id: bb.item_id, price: bb.price, original_price: bb.original_price, condition: bb.condition }, ...items];
        }

        const seen = new Set<string>();
        for (const it of items) {
          if (!it.item_id || !it.price || seen.has(it.item_id)) continue;
          if (it.condition && it.condition !== "new") continue;
          seen.add(it.item_id);
          const isWinner = bb?.item_id === it.item_id;
          const url = isWinner ? productUrl : itemUrl(it.item_id);
          out.push({
            source: "mercadolivre",
            store: "Mercado Livre",
            externalId: it.item_id,
            title,
            url,
            affiliateUrl: affiliate(url),
            imageUrl: image,
            price: Number(it.price),
            listPrice: it.original_price ? Number(it.original_price) : null,
          });
        }
      }
      // Diagnóstico: achou o modelo no catálogo, mas sem ninguém vendendo agora
      if (hits.length && !out.length) rejected[product.slug] = hits.map((h) => `${h.name} (no catálogo, sem vendedor ativo)`);
      return out;
    },
  };
}
