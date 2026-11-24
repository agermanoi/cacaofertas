import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError, httpJson, sleep } from "./http";
import { getMlAccessToken } from "./ml-token";
import { applyAffiliateTags } from "./click-tags";
import { shopeeQuery } from "./collectors/shopee";

/**
 * Catálogo para sites parceiros (API privada /api/catalogo).
 *
 * Usa as credenciais do Mercado Livre e da Shopee deste projeto para:
 *  - link:    a partir do link de um produto, devolver nome, foto e link de afiliado;
 *  - buscar:  procurar produtos por termo;
 *  - checar:  dizer se cada produto ainda está à venda.
 *
 * Não devolve preço: quem consome mostra só "ver preço na loja".
 * Amazon não passa por aqui (cada site parceiro usa a própria conta de associado).
 */

export type Loja = "mercadolivre" | "shopee";

export interface ItemCatalogo {
  loja: Loja;
  /** referência estável para checar depois: ml:p:MLB123 (catálogo), ml:i:MLB123 (anúncio) ou shopee:SHOP.ITEM */
  ref: string;
  nome: string;
  imagem: string | null;
  link: string;
  disponivel: boolean;
  vendas?: number | null;
  nota?: number | null;
  oficial?: boolean;
}

const ML_API = "https://api.mercadolibre.com";
const ML_HOST = /(^|\.)(mercadoli(vre|bre)\.com(\.br)?|meli\.la)$/i;
const SHOPEE_HOST = /(^|\.)(shopee\.com\.br|shp\.ee)$/i;
const AMAZON_HOST = /(^|\.)(amazon\.com(\.br)?|amzn\.to|a\.co)$/i;
const USED = /\b(semi ?novo|seminova|usad[oa]|vitrine|mostru[aá]rio|reembalad[oa]|recondicionad[oa]|refurbished|open ?box|com defeito)\b/i;

export class CatalogoErro extends Error {}

function https(u?: string | null): string | null {
  return u ? u.replace(/^http:\/\//i, "https://") : null;
}

/** Segue links curtos (meli.la, mercadolivre.com/sec, s.shopee.com.br) até o endereço final. */
async function resolve(url: string): Promise<string> {
  let cur = url;
  for (let i = 0; i < 6; i++) {
    const u = new URL(cur);
    const short = /^(meli\.la|s\.shopee\.com\.br|shp\.ee)$/i.test(u.hostname) || /\/(sec|social)\//.test(u.pathname);
    if (!short) return cur;
    const res = await fetch(cur, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" }, cache: "no-store" });
    const loc = res.headers.get("location");
    if (!loc) return cur;
    cur = new URL(loc, cur).toString();
  }
  return cur;
}

export function lojaDoLink(url: string): Loja | "amazon" | null {
  try {
    const h = new URL(url).hostname;
    if (ML_HOST.test(h)) return "mercadolivre";
    if (SHOPEE_HOST.test(h)) return "shopee";
    if (AMAZON_HOST.test(h)) return "amazon";
  } catch {
    /* inválido */
  }
  return null;
}

/* ─── Mercado Livre ─────────────────────────────────────────────────────────── */

let diagnostico = "";
export function ultimoDiagnostico(): string {
  const d = diagnostico;
  diagnostico = "";
  return d;
}

function ml(db: SupabaseClient) {
  let token: string | null = null;
  async function get<T>(path: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      token = token || (await getMlAccessToken(db, attempt > 0));
      try {
        const r = await httpJson<T>(`${ML_API}${path}`, { headers: { authorization: `Bearer ${token}` } });
        await sleep(300);
        return r;
      } catch (e) {
        if (e instanceof HttpError && e.status === 401 && attempt === 0) {
          token = null; // token guardado venceu antes da hora: renova uma vez
          continue;
        }
        if (e instanceof HttpError && e.status === 429 && attempt < 2) {
          await sleep(4000);
          continue;
        }
        throw e;
      }
    }
  }

  type Produto = { id: string; name: string; permalink?: string; pictures?: { url?: string; secure_url?: string }[]; buy_box_winner?: { item_id?: string } | null; status?: string };
  type Anuncio = { id: string; title: string; permalink?: string; status?: string; available_quantity?: number; pictures?: { url?: string; secure_url?: string }[]; thumbnail?: string; catalog_product_id?: string | null };

  let itemsBloqueado = false;
  /**
   * Alguém vende esse produto de catálogo agora?
   *  - status inativo → não;
   *  - tem buy box → sim;
   *  - sem buy box: pergunta a lista de vendedores; lista vazia → não.
   *  - Se o ML não deixar consultar a lista (403, aconteceu em nov/2026), não dá para afirmar que
   *    acabou: o produto ativo no catálogo conta como disponível. Só "não" com certeza.
   */
  async function temVendedor(p: Produto): Promise<boolean> {
    if (p.status === "inactive") return false;
    if (p.buy_box_winner?.item_id) return true;
    if (itemsBloqueado) return true;
    try {
      const r = await get<{ results?: { item_id?: string }[] }>(`/products/${p.id}/items?limit=1`);
      return Boolean(r.results?.length);
    } catch (e) {
      if (e instanceof HttpError && (e.status === 403 || e.status === 401)) {
        itemsBloqueado = true;
        return true;
      }
      if (e instanceof HttpError && e.status === 404) return false;
      return true;
    }
  }

  async function deProduto(id: string): Promise<ItemCatalogo> {
    const p = await get<Produto>(`/products/${id}`);
    const link = p.permalink || `https://www.mercadolivre.com.br/p/${id}`;
    return {
      loja: "mercadolivre",
      ref: `ml:p:${id}`,
      nome: p.name,
      imagem: https(p.pictures?.[0]?.secure_url || p.pictures?.[0]?.url),
      link: await applyAffiliateTags(db, link),
      disponivel: await temVendedor(p),
    };
  }

  async function deAnuncio(id: string): Promise<ItemCatalogo> {
    let a: Anuncio;
    try {
      a = await get<Anuncio>(`/items/${id}`);
    } catch (e) {
      throw new CatalogoErro(`O Mercado Livre não deixou ler o anúncio ${id} (${e instanceof HttpError ? e.status : "erro"}). Tente o link da página do produto (com /p/MLB…).`);
    }
    if (a.catalog_product_id) {
      try {
        return await deProduto(a.catalog_product_id);
      } catch {
        /* segue com o anúncio */
      }
    }
    const link = a.permalink || `https://produto.mercadolivre.com.br/${id.replace(/^([A-Z]+)(\d+)$/, "$1-$2")}`;
    return {
      loja: "mercadolivre",
      ref: `ml:i:${id}`,
      nome: a.title,
      imagem: https(a.pictures?.[0]?.secure_url || a.pictures?.[0]?.url || a.thumbnail),
      link: await applyAffiliateTags(db, link),
      disponivel: a.status === "active" && (a.available_quantity ?? 1) > 0,
    };
  }

  return {
    async link(url: string): Promise<ItemCatalogo> {
      const final = await resolve(url);
      const u = new URL(final);
      const p = u.pathname.match(/\/p\/(MLB\d+)/i);
      const filtro = (u.searchParams.get("pdp_filters") || "").match(/item_id[:%3A]+(MLB\d+)/i) || (u.searchParams.get("wid") || "").match(/^(MLB\d+)$/i);
      const item = u.pathname.match(/\/(MLB)-?(\d{6,})/i);
      if (p) return deProduto(p[1].toUpperCase());
      if (filtro) return deAnuncio(filtro[1].toUpperCase());
      if (item) return deAnuncio(`MLB${item[2]}`);
      throw new CatalogoErro("Não achei o código do produto nesse link do Mercado Livre. Abra o produto e copie o endereço da barra (ele tem MLB e números).");
    },

    async buscar(termo: string, limite: number): Promise<ItemCatalogo[]> {
      const params = new URLSearchParams({ site_id: "MLB", status: "active", q: termo, limit: "20" });
      const hits = (await get<{ results?: { id: string }[] }>(`/products/search?${params}`)).results || [];
      const out: ItemCatalogo[] = [];
      let examinados = 0;
      let semVendedor = 0;
      for (const h of hits) {
        if (out.length >= limite || examinados >= limite * 3) break;
        examinados++;
        try {
          const it = await deProduto(h.id);
          if (!it.disponivel) semVendedor++;
          else if (!USED.test(it.nome)) out.push(it);
        } catch {
          /* pula */
        }
      }
      if (!out.length) {
        diagnostico = `catálogo do ML: ${hits.length} produtos para "${termo}", ${semVendedor} sem vendedor agora${itemsBloqueado ? " (lista de vendedores bloqueada para o app)" : ""}`;
      }
      return out;
    },

    async checar(ref: string): Promise<boolean | null> {
      const [, tipo, id] = ref.split(":");
      try {
        return tipo === "p" ? (await deProduto(id)).disponivel : (await deAnuncio(id)).disponivel;
      } catch (e) {
        if (e instanceof HttpError && e.status === 404) return false;
        if (e instanceof CatalogoErro) return null;
        return null;
      }
    },
  };
}

/* ─── Shopee ────────────────────────────────────────────────────────────────── */

type ShopeeNode = {
  itemId: number;
  shopId?: number;
  productName: string;
  sales?: number | null;
  ratingStar?: string | null;
  shopType?: number[] | null;
  productLink: string;
  offerLink: string;
  imageUrl?: string | null;
};
const SHOPEE_FIELDS = "itemId shopId productName sales ratingStar shopType productLink offerLink imageUrl";

/**
 * Lojas oficiais (Shopee Mall) de marcas de cozinha. A busca geral por palavra da Shopee às vezes
 * devolve "error [10000]: System Error"; a busca dentro de uma loja (keyword + shopId) continua
 * funcionando, então ela é o plano B. A lista de lojas fica em cache na kv por 7 dias.
 */
const MARCAS_COZINHA = ["tramontina", "brinox", "rochedo", "mondial", "britania", "philco", "oster", "electrolux", "arno", "wap", "panelux", "oxford"];
const KV_LOJAS = "shopee_lojas_cozinha";

async function lojasCozinha(db: SupabaseClient, q: <T>(query: string) => Promise<T>): Promise<number[]> {
  const { data } = await db.from("kv").select("value,updated_at").eq("key", KV_LOJAS).maybeSingle();
  if (data?.value && data.updated_at && Date.now() - new Date(data.updated_at).getTime() < 7 * 86400000) {
    try {
      const ids = JSON.parse(String(data.value)) as number[];
      if (ids.length) return ids;
    } catch {
      /* refaz */
    }
  }
  const ids: number[] = [];
  for (const marca of MARCAS_COZINHA) {
    try {
      const d = await q<{ shopOfferV2: { nodes: { shopId: number; shopName: string; shopType?: number[] }[] } }>(
        `{shopOfferV2(keyword:${JSON.stringify(marca)},limit:20){nodes{shopId shopName shopType}}}`
      );
      for (const sh of d?.shopOfferV2?.nodes || []) {
        if ((sh.shopType || []).includes(1) && sh.shopName.toLowerCase().includes(marca) && !ids.includes(sh.shopId)) ids.push(sh.shopId);
      }
    } catch {
      /* próxima marca */
    }
  }
  if (ids.length) await db.from("kv").upsert({ key: KV_LOJAS, value: JSON.stringify(ids), updated_at: new Date().toISOString() });
  return ids;
}

function shopee(db: SupabaseClient, subId: string | null) {
  async function q<T>(query: string): Promise<T> {
    try {
      return await shopeeQuery<T>(query);
    } finally {
      await sleep(400);
    }
  }

  async function linkCurto(n: ShopeeNode): Promise<string> {
    if (!subId) return n.offerLink;
    try {
      const d = await q<{ generateShortLink: { shortLink: string } }>(
        `mutation{generateShortLink(input:{originUrl:${JSON.stringify(n.productLink)},subIds:[${JSON.stringify(subId)}]}){shortLink}}`
      );
      return d?.generateShortLink?.shortLink || n.offerLink;
    } catch {
      return n.offerLink;
    }
  }

  async function paraItem(n: ShopeeNode, shopId?: number | string): Promise<ItemCatalogo> {
    return {
      loja: "shopee",
      ref: `shopee:${n.shopId ?? shopId ?? 0}.${n.itemId}`,
      nome: String(n.productName || "").trim(),
      imagem: https(n.imageUrl),
      link: await linkCurto(n),
      disponivel: true,
      vendas: n.sales ?? null,
      nota: n.ratingStar ? Number(n.ratingStar) : null,
      oficial: (n.shopType || []).includes(1),
    };
  }

  async function porId(shopId: string, itemId: string): Promise<ShopeeNode | null> {
    for (const args of [`shopId:${shopId},itemId:${itemId}`, `itemId:${itemId}`]) {
      try {
        const d = await q<{ productOfferV2: { nodes: ShopeeNode[] } }>(`{productOfferV2(${args},page:1,limit:1){nodes{${SHOPEE_FIELDS}}}}`);
        const n = d?.productOfferV2?.nodes?.[0];
        if (n) return n;
      } catch {
        /* tenta o próximo formato */
      }
    }
    return null;
  }

  return {
    async link(url: string): Promise<ItemCatalogo> {
      const final = decodeURIComponent(await resolve(url));
      const m = final.match(/-i\.(\d+)\.(\d+)/) || final.match(/\/product\/(\d+)\/(\d+)/);
      if (!m) throw new CatalogoErro("Não achei o código do produto nesse link da Shopee. Abra o produto e copie o endereço da barra.");
      const n = await porId(m[1], m[2]);
      if (!n) throw new CatalogoErro("A Shopee não devolveu esse produto pelo programa de afiliados (pode estar fora do programa ou sem estoque).");
      return paraItem(n, m[1]);
    },

    async buscar(termo: string, limite: number): Promise<ItemCatalogo[]> {
      let nodes: ShopeeNode[] = [];
      let falha = "";
      // 1) busca geral (sortType 2 = mais vendidos; se falhar, sem ordenação)
      for (const [i, extra] of [",sortType:2", "", ",sortType:2"].entries()) {
        if (i === 2) await sleep(2500); // o erro 10000 costuma ser passageiro
        try {
          const d = await q<{ productOfferV2: { nodes: ShopeeNode[] } }>(`{productOfferV2(keyword:${JSON.stringify(termo)}${extra},page:1,limit:40){nodes{${SHOPEE_FIELDS}}}}`);
          nodes = d?.productOfferV2?.nodes || [];
          falha = "";
          break;
        } catch (e) {
          falha = (e as Error).message;
        }
      }
      // 2) plano B: dentro das lojas oficiais de marcas de cozinha
      if (falha) {
        const lojas = await lojasCozinha(db, q);
        // termo inteiro e, se não achar nada, só as palavras principais ("jogo de panelas antiaderente" → "panelas antiaderente" → "panelas")
        const palavras = termo.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !["com", "para", "de", "kit", "jogo"].includes(w));
        const termos = Array.from(new Set([termo, palavras.slice(0, 2).join(" "), palavras[0]].filter((t) => t && t.length >= 3)));
        for (const t of termos) {
          for (const shopId of lojas) {
            if (nodes.length >= limite * 2) break;
            try {
              const d = await q<{ productOfferV2: { nodes: ShopeeNode[] } }>(`{productOfferV2(keyword:${JSON.stringify(t)},shopId:${shopId},page:1,limit:10){nodes{${SHOPEE_FIELDS}}}}`);
              nodes.push(...(d?.productOfferV2?.nodes || []));
            } catch {
              /* próxima loja */
            }
          }
          if (nodes.length) break;
        }
        nodes.sort((a, b) => Number(b.sales || 0) - Number(a.sales || 0));
        if (!nodes.length) {
          throw new CatalogoErro(`A busca da Shopee está fora do ar (${falha}) e as lojas oficiais não têm "${termo}". Tente de novo mais tarde ou cole o link do produto.`);
        }
        diagnostico = `busca geral da Shopee indisponível (${falha}); resultados das lojas oficiais de cozinha`;
      }
      const out: ItemCatalogo[] = [];
      for (const n of nodes) {
        if (out.length >= limite) break;
        if (USED.test(n.productName || "")) continue;
        const oficial = (n.shopType || []).includes(1);
        if (!oficial && (Number(n.ratingStar || 0) < 4.5 || Number(n.sales || 0) < 10)) continue;
        out.push(await paraItem(n));
      }
      return out;
    },

    async checar(ref: string): Promise<boolean | null> {
      const m = ref.match(/^shopee:(\d+)\.(\d+)$/);
      if (!m) return null;
      try {
        return Boolean(await porId(m[1], m[2]));
      } catch {
        return null;
      }
    },
  };
}

/* ─── Entrada única ─────────────────────────────────────────────────────────── */

/** As chaves da Shopee podem estar na tabela kv (como na coleta) em vez de variável de ambiente. */
export async function carregarChaves(db: SupabaseClient): Promise<void> {
  if (process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET) return;
  const { data } = await db.from("kv").select("key,value").in("key", ["shopee_app_id", "shopee_secret"]);
  for (const r of data || []) {
    const env = r.key === "shopee_app_id" ? "SHOPEE_APP_ID" : "SHOPEE_SECRET";
    if (!process.env[env] && r.value) process.env[env] = String(r.value);
  }
}

export function catalogo(db: SupabaseClient, subId: string | null) {
  const m = ml(db);
  const s = shopee(db, subId);
  const temMl = Boolean(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET);
  const temShopee = Boolean(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET);
  const loja = (l: Loja) => {
    if (l === "mercadolivre" && !temMl) throw new CatalogoErro("Mercado Livre não configurado neste projeto.");
    if (l === "shopee" && !temShopee) throw new CatalogoErro("Shopee não configurada neste projeto.");
    return l === "mercadolivre" ? m : s;
  };

  return {
    async link(url: string): Promise<ItemCatalogo> {
      const l = lojaDoLink(url);
      if (l === "amazon") throw new CatalogoErro("Links da Amazon não passam por este catálogo.");
      if (!l) throw new CatalogoErro("Cole um link do Mercado Livre ou da Shopee.");
      return loja(l).link(url);
    },
    async buscar(l: Loja, termo: string, limite: number): Promise<ItemCatalogo[]> {
      return loja(l).buscar(termo, limite);
    },
    async checar(refs: string[]): Promise<{ ref: string; disponivel: boolean | null }[]> {
      const out = [];
      for (const ref of refs) {
        const l: Loja | null = ref.startsWith("ml:") ? "mercadolivre" : ref.startsWith("shopee:") ? "shopee" : null;
        out.push({ ref, disponivel: l ? await loja(l).checar(ref) : null });
      }
      return out;
    },
  };
}
