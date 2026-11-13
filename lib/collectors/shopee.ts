import { createHash } from "node:crypto";
import type { Collector, OfferInput, Product } from "../types";
import { http, sleep } from "../http";
import { matchesProduct, titleMatches } from "../match";

/**
 * Shopee (programa de afiliados, Open API em GraphQL).
 * https://open-api.affiliate.shopee.com.br/graphql
 * Assinatura: SHA256(AppID + timestamp + corpo exato da requisição + senha), em hexadecimal.
 * O offerLink que a API devolve já é o link curto de afiliado (s.shopee.com.br).
 *
 * Env (ou tabela kv): SHOPEE_APP_ID, SHOPEE_SECRET
 *
 * A Shopee é um marketplace aberto: muito anúncio genérico e réplica. Por isso, além do filtro de título
 * e preço do produto, só entram anúncios com avaliação ≥ 4,5 e pelo menos 10 vendas.
 *
 * Busca em duas etapas:
 *  1. busca geral por palavra (productOfferV2 keyword). Em nov/2026 ela devolvia "error [10000]: System Error"
 *     para quase toda palavra; quando falha, seguimos para a etapa 2.
 *  2. lojas oficiais (Shopee Mall, shopType 1) da marca: shopOfferV2(keyword: marca) e depois
 *     productOfferV2(keyword, shopId), que funciona. Ex.: "Philco Oficial", "Britânia Oficial", "Iplace" (Apple).
 */
const URL_API = "https://open-api.affiliate.shopee.com.br/graphql";
const MIN_RATING = 4.5;
const MIN_SALES = 10;
const USED = /\b(semi ?novo|seminova|usad[oa]|vitrine|mostru[aá]rio|poucas marcas|marcas de uso|reembalad[oa]|recondicionad[oa]|refurbished|open ?box|sem caixa|caixa aberta|com defeito|retirada de pe[cç]as|leia a descri[cç][aã]o)\b/i;
/** Revendas oficiais que não têm o nome da marca (a busca de lojas é por nome). */
const RESELLERS: Record<string, string[]> = { iphone: ["iplace"], ipad: ["iplace"], apple: ["iplace"], macbook: ["iplace"], airpods: ["iplace"] };
const STOP = new Set(["smart", "tv", "console", "air", "fryer", "fone", "notebook", "cafeteira", "de", "com", "para", "gamer", "monitor", "midia", "fisica", "wifi", "5g", "4k", "uhd"]);

type Node = {
  itemId: number;
  productName: string;
  priceMin: string;
  priceMax: string;
  priceDiscountRate?: number | null;
  sales?: number | null;
  ratingStar?: string | null;
  shopName?: string | null;
  shopType?: number[] | null;
  productLink: string;
  offerLink: string;
  imageUrl?: string | null;
};

export async function shopeeQuery<T>(query: string): Promise<T> {
  const app = process.env.SHOPEE_APP_ID!;
  const body = JSON.stringify({ query });
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHash("sha256").update(app + ts + body + process.env.SHOPEE_SECRET!).digest("hex");
  const res = await http(URL_API, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `SHA256 Credential=${app}, Timestamp=${ts}, Signature=${sig}` },
    body,
  });
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join("; "));
  return json.data as T;
}

const gqlString = (s: string) => JSON.stringify(s);

type Shop = { shopId: number; shopName: string; shopType?: number[] | null };

const SEARCH_FIELDS = "itemId productName priceMin priceMax priceDiscountRate sales ratingStar shopName shopType productLink offerLink imageUrl";

export function shopee(): Collector {
  const rejected: Record<string, string[]> = {};
  const shopCache = new Map<string, Shop[]>();
  let globalFails = 0;

  async function search(args: string): Promise<Node[] | null> {
    try {
      const data = await shopeeQuery<{ productOfferV2: { nodes: Node[] } }>(`{productOfferV2(${args},page:1,limit:50){nodes{${SEARCH_FIELDS}}}}`);
      return data?.productOfferV2?.nodes || [];
    } catch (e) {
      console.warn(`[shopee] ${args}: ${(e as Error).message}`);
      return null;
    } finally {
      await sleep(500);
    }
  }

  /** Lojas oficiais (Shopee Mall) cujo nome tem a palavra (marca). */
  async function officialShops(word: string): Promise<Shop[]> {
    if (shopCache.has(word)) return shopCache.get(word)!;
    let shops: Shop[] = [];
    try {
      const data = await shopeeQuery<{ shopOfferV2: { nodes: Shop[] } }>(`{shopOfferV2(keyword:${gqlString(word)},limit:20){nodes{shopId shopName shopType}}}`);
      shops = (data?.shopOfferV2?.nodes || []).filter((x) => (x.shopType || []).includes(1) && x.shopName.toLowerCase().includes(word));
    } catch (e) {
      console.warn(`[shopee] lojas "${word}": ${(e as Error).message}`);
    }
    await sleep(500);
    shopCache.set(word, shops);
    return shops;
  }

  function brandWords(product: Product): string[] {
    const words = `${product.query} ${(product.must || []).map((t) => t.split("|")[0].replace(/^~/, "")).join(" ")}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !/^\d+/.test(w) && !STOP.has(w));
    const out = new Set<string>();
    for (const w of words.slice(0, 3)) {
      out.add(w);
      for (const r of RESELLERS[w] || []) out.add(r);
    }
    return [...out];
  }

  return {
    source: "shopee",
    rejected,
    enabled: () => Boolean(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET),
    async collect(product: Product): Promise<OfferInput[]> {
      delete rejected[product.slug];
      const refused: string[] = [];
      const seen = new Set<string>();
      const out: OfferInput[] = [];
      const take = (nodes: Node[], how: string) => {
        for (const n of nodes) {
          const id = String(n.itemId);
          if (seen.has(id)) continue;
          seen.add(id);
          const price = Number(n.priceMin);
          const title = String(n.productName || "");
          // preço "a partir de" com variações muito diferentes (ex.: capa a R$ 10 e aparelho a R$ 3.000) não serve
          if (!price || Number(n.priceMax) > price * 1.15) continue;
          // usado, vitrine e recondicionado não entram (o histórico compara produto novo)
          if (USED.test(title)) {
            if (refused.length < 6) refused.push(`${title} (usado/recondicionado)`);
            continue;
          }
          if (!titleMatches(product, title)) {
            if (refused.length < 6) refused.push(`${title} (${how})`);
            continue;
          }
          const official = (n.shopType || []).includes(1);
          if (!official && (Number(n.ratingStar || 0) < MIN_RATING || Number(n.sales || 0) < MIN_SALES)) {
            if (refused.length < 6) refused.push(`${title} (avaliação ${n.ratingStar ?? "?"}, ${n.sales ?? 0} vendas)`);
            continue;
          }
          const disc = Number(n.priceDiscountRate || 0);
          const offer: OfferInput = {
            source: "shopee",
            store: "Shopee",
            externalId: id,
            title,
            url: n.productLink,
            affiliateUrl: n.offerLink || null,
            imageUrl: n.imageUrl || null,
            price,
            listPrice: disc > 0 && disc < 90 ? Math.round((price / (1 - disc / 100)) * 100) / 100 : null,
            meta: { shopName: String(n.shopName || "") },
          };
          if (matchesProduct(product, offer)) out.push(offer);
        }
      };

      // 1. busca geral (desliga nesta coleta depois de 5 falhas seguidas)
      if (globalFails < 5) {
        const nodes = await search(`keyword:${gqlString(product.query)},sortType:1`);
        if (nodes) {
          globalFails = 0;
          take(nodes, `busca "${product.query}"`);
        } else globalFails++;
      }
      // 2. lojas oficiais da marca
      if (!out.length) {
        for (const w of brandWords(product)) {
          for (const shop of await officialShops(w)) {
            const nodes = await search(`keyword:${gqlString(product.query)},shopId:${shop.shopId}`);
            if (nodes) take(nodes, shop.shopName);
          }
          if (out.length) break;
        }
      }
      // fica só com as 5 mais baratas (o mesmo produto aparece em várias lojas)
      out.sort((a, b) => a.price - b.price);
      if (!out.length && refused.length) rejected[product.slug] = refused;
      return out.slice(0, 5);
    },
  };
}
