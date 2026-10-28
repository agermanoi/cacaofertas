import type { Collector, OfferInput, Product } from "../types";
import { httpJson, http, parsePrice, sleep } from "../http";
import { isBlockedStore, normalizeStore } from "../affiliate";
import { matchesProduct } from "../match";

/**
 * Afilio (rede de afiliados).
 *
 * Preços: feed de produtos de cada campanha aceita (aff_get_boutique.php, 1.000 itens por página).
 * Cada feed é identificado por progid (campanha) + boutiqueid (feed), que aparecem no painel V2.
 * Os feeds são baixados UMA vez por coleta e ficam em memória; cada produto do site
 * é procurado neles pelo filtro de título e preço.
 *
 * Env (ou tabela kv): AFILIO_TOKEN, AFILIO_AFFID, AFILIO_SITEID
 *   AFILIO_FEEDS = JSON [{ "progid": "1010", "boutiqueid": "1-895987", "store": "Nome da loja" }]
 *   AFILIO_MAX_PAGES (padrão 30 páginas de 1.000 por feed)
 */

const BASE = "https://v2.afilio.com.br";

type FeedConf = { progid: string; boutiqueid: string; store?: string };
type FeedItem = { title: string; price: number; listPrice: number | null; url: string; image: string | null; store: string; id: string };

function feeds(): FeedConf[] {
  try {
    const list = JSON.parse(process.env.AFILIO_FEEDS || "[]");
    return Array.isArray(list) ? list.filter((f) => f?.progid && f?.boutiqueid).map((f) => ({ ...f, progid: String(f.progid), boutiqueid: String(f.boutiqueid) })) : [];
  } catch {
    return [];
  }
}

/** Pega o primeiro campo existente entre vários nomes possíveis (o formato do feed varia por loja). */
function pick(o: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    const v = o[k] ?? o[k.toLowerCase()] ?? o[k.toUpperCase()];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

function toItem(raw: Record<string, any>, conf: FeedConf): FeedItem | null {
  const o = raw.produto || raw.product || raw;
  const title = String(pick(o, ["nome", "name", "title", "titulo", "product_name"]) || "").trim();
  const promo = parsePrice(pick(o, ["preco_promocao", "sale_price", "price_sale", "preco_por", "price"]));
  const normal = parsePrice(pick(o, ["preco_normal", "price_from", "preco_de", "old_price", "list_price"]));
  const price = promo || normal;
  const url = String(pick(o, ["link_produto", "url_tracking", "tracking_url", "link", "url", "deeplink"]) || "").trim();
  if (!title || !price || !url) return null;
  const store = conf.store || String(pick(o, ["loja", "store", "advertiser", "anunciante"]) || `Afilio ${conf.progid}`);
  return {
    title,
    price,
    listPrice: normal && promo && normal > promo ? normal : null,
    url,
    image: pick(o, ["link_imagem", "image", "image_url", "imagem"]) || null,
    store: normalizeStore(store),
    id: String(pick(o, ["id", "sku", "id_produto", "codigo", "ean"]) || url),
  };
}

async function loadFeed(conf: FeedConf, sample: Record<string, unknown>): Promise<FeedItem[]> {
  const token = process.env.AFILIO_TOKEN!;
  const maxPages = Number(process.env.AFILIO_MAX_PAGES || 30);
  const out: FeedItem[] = [];
  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({ boutiqueid: conf.boutiqueid, token, progid: conf.progid, format: "JSON", offset: String(page) });
    const json = await httpJson<any>(`${BASE}/aff/aff_get_boutique.php?${params}`);
    const rows: any[] = Array.isArray(json) ? json : json?.produtos || json?.products || json?.items || json?.data || [];
    if (page === 0) sample[`${conf.progid}:${conf.boutiqueid}`] = rows[0] ? Object.keys(rows[0].produto || rows[0].product || rows[0]) : json;
    for (const r of rows) {
      const it = toItem(r, conf);
      if (it && !isBlockedStore(it.store)) out.push(it);
    }
    if (rows.length < 1000) break;
    await sleep(500);
  }
  return out;
}

export function afilio(): Collector & { prepare(): Promise<Record<string, unknown>> } {
  let items: FeedItem[] | null = null;
  const info: Record<string, unknown> = {};
  return {
    source: "afilio",
    enabled: () => Boolean(process.env.AFILIO_TOKEN && feeds().length),
    /** Baixa todos os feeds configurados (chamado uma vez por coleta). */
    async prepare() {
      items = [];
      const sample: Record<string, unknown> = {};
      const counts: Record<string, number> = {};
      const errors: Record<string, string> = {};
      for (const f of feeds()) {
        try {
          const list = await loadFeed(f, sample);
          counts[`${f.store || f.progid}`] = list.length;
          items.push(...list);
        } catch (e) {
          errors[`${f.store || f.progid}`] = (e as Error).message.slice(0, 200);
        }
      }
      Object.assign(info, { counts, errors, sample });
      return info;
    },
    async collect(product: Product): Promise<OfferInput[]> {
      if (!items) await this.prepare();
      return (items || [])
        .filter((it) => matchesProduct(product, { title: it.title, price: it.price } as OfferInput))
        .map((it) => ({
          source: "afilio",
          store: it.store,
          externalId: it.id.slice(0, 300),
          title: it.title,
          url: it.url,
          affiliateUrl: it.url, // o link do feed da Afilio já vem rastreado
          imageUrl: it.image,
          price: it.price,
          listPrice: it.listPrice,
        }));
    },
  };
}

/** Campanhas (lojas) da conta, com status. Diagnóstico para o painel. */
export async function afilioCampaigns(): Promise<{ list: unknown[]; error?: string }> {
  try {
    const params = new URLSearchParams({ token: process.env.AFILIO_TOKEN || "", affid: process.env.AFILIO_AFFID || "" });
    const res = await http(`${BASE}/api/prog_api.php?${params}`);
    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return { list: [], error: `Resposta não-JSON: ${text.slice(0, 300)}` };
    }
    const list = Array.isArray(data) ? data : data?.list || data?.programs || data?.campanhas || Object.values(data || {});
    return { list: (list as any[]).slice(0, 300) };
  } catch (e) {
    return { list: [], error: (e as Error).message.slice(0, 300) };
  }
}
