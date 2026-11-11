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
 */
const URL_API = "https://open-api.affiliate.shopee.com.br/graphql";
const MIN_RATING = 4.5;
const MIN_SALES = 10;

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

function queries(product: Product): string[] {
  const words = (product.must || [])
    .map((t) => t.split("|")[0].replace(/^~/, ""))
    .filter((t) => t.length > 1)
    .join(" ");
  return [...new Set([product.query, words].map((q) => q.trim()).filter((q) => q.length > 2))];
}

export function shopee(): Collector {
  const rejected: Record<string, string[]> = {};
  let failures = 0;
  return {
    source: "shopee",
    rejected,
    enabled: () => Boolean(process.env.SHOPEE_APP_ID && process.env.SHOPEE_SECRET),
    async collect(product: Product): Promise<OfferInput[]> {
      // a busca por palavra às vezes fica fora do ar na Shopee ("System Error"): depois de 3 falhas seguidas, para nesta coleta
      if (failures >= 3) return [];
      delete rejected[product.slug];
      const out: OfferInput[] = [];
      const refused: string[] = [];
      const seen = new Set<string>();
      for (const q of queries(product)) {
        let nodes: Node[] = [];
        try {
          const data = await shopeeQuery<{ productOfferV2: { nodes: Node[] } }>(
            `{productOfferV2(keyword:${gqlString(q)},sortType:1,page:1,limit:50){nodes{itemId productName priceMin priceMax priceDiscountRate sales ratingStar shopName shopType productLink offerLink imageUrl}}}`
          );
          nodes = data?.productOfferV2?.nodes || [];
          failures = 0;
        } catch (e) {
          failures++;
          console.warn(`[shopee] busca "${q}": ${(e as Error).message}`);
          break;
        } finally {
          await sleep(600);
        }
        for (const n of nodes) {
          const id = String(n.itemId);
          if (seen.has(id)) continue;
          seen.add(id);
          const price = Number(n.priceMin);
          const title = String(n.productName || "");
          // preço "a partir de" com variações muito diferentes (ex.: capa a R$ 10 e aparelho a R$ 3.000) não serve
          if (!price || Number(n.priceMax) > price * 1.15) continue;
          if (!titleMatches(product, title)) {
            if (refused.length < 6) refused.push(`${title} (busca "${q}")`);
            continue;
          }
          if (Number(n.ratingStar || 0) < MIN_RATING || Number(n.sales || 0) < MIN_SALES) {
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
        if (out.length) break;
      }
      // fica só com as 5 mais baratas (o mesmo produto aparece em dezenas de lojas)
      out.sort((a, b) => a.price - b.price);
      if (!out.length && refused.length) rejected[product.slug] = refused;
      return out.slice(0, 5);
    },
  };
}
