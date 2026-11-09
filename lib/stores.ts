import { publicClient } from "./supabase";
import { demo } from "./mock";

/** Lojas com página própria (/loja/<slug>): só as que têm volume para comparar. */
export const STORES = [
  { slug: "amazon", name: "Amazon", art: "a" },
  { slug: "mercado-livre", name: "Mercado Livre", art: "o" },
] as const;
export type StoreInfo = (typeof STORES)[number];

export const storeBySlug = (slug: string) => STORES.find((s) => s.slug === slug) || null;
export const storeSlug = (name: string | null | undefined) => STORES.find((s) => s.name === name)?.slug || null;

export interface StoreReport {
  store: string;
  days: number;
  products: number;
  compared: number;
  wins: number;
  rivals: { rival: string; n: number; cheaper: number; tie: number; median_diff: number | null; products: number }[];
  categories: { category: string; n: number; wins: number }[];
  cheapest: { slug: string; name: string; category: string; price: number; next_store: string | null; next_price: number | null; gap: number | null }[];
}

export async function getStoreReport(store: string, days = 14): Promise<StoreReport | null> {
  if (demo.enabled() || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  const { data, error } = await publicClient().rpc("store_report", { p_store: store, p_days: days });
  if (error) {
    console.error("[stores] report:", error.message);
    return null;
  }
  return data as StoreReport;
}

const pct = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const the = (s: { name: string; art: string }) => `${s.art} ${s.name}`;
const The = (s: { name: string; art: string }) => `${s.art.toUpperCase()} ${s.name}`;
const artOf = (name: string) => STORES.find((s) => s.name === name)?.art || (/^(mercado|carrefour|ponto)/i.test(name) ? "o" : "a");

/** Parágrafos e perguntas frequentes da página da loja, montados com os números do relatório. */
export function storeTexts(s: StoreInfo, r: StoreReport) {
  const paras: string[] = [];
  const share = r.compared ? r.wins / r.compared : 0;
  if (r.compared >= 10)
    paras.push(
      `Nos últimos ${r.days} dias, comparamos ${the(s)} com outras lojas em ${r.compared} leituras de preço (mesmo produto, mesmo dia). ${The(s)} teve o menor preço em ${r.wins} delas, ou ${pct(share)}.`
    );
  const faq: { q: string; a: string }[] = [];
  for (const rv of r.rivals.slice(0, 3)) {
    if (rv.n < 10) continue;
    const other = { name: rv.rival, art: artOf(rv.rival) };
    const otherCheaper = rv.n - rv.cheaper - rv.tie;
    const med = rv.median_diff == null ? null : Number(rv.median_diff);
    const medTxt =
      med == null || Math.abs(med) < 0.005
        ? "Na diferença típica, os dois ficaram praticamente empatados."
        : med > 0
          ? `Na diferença típica (mediana), ${the(other)} ficou ${pct(med)} mais caro${other.art === "a" ? "a" : ""}.`
          : `Na diferença típica (mediana), ${the(s)} ficou ${pct(med)} mais car${s.art === "a" ? "a" : "o"}.`;
    const line = `${s.name} x ${other.name}: em ${rv.n} comparações de ${rv.products} produtos, ${the(s)} foi mais barat${s.art === "a" ? "a" : "o"} em ${rv.cheaper} (${pct(rv.cheaper / rv.n)}), ${the(other)} em ${otherCheaper}${rv.tie ? ` e houve ${rv.tie} empates` : ""}. ${medTxt}`;
    paras.push(line);
    if (faq.length < 2)
      faq.push({
        q: `${The(s)} é mais barat${s.art === "a" ? "a" : "o"} que ${the(other)}?`,
        a: `Depende do produto. ${line} Por isso vale comparar o preço de cada produto no dia da compra.`,
      });
  }
  const cats = r.categories.filter((c) => c.n >= 5).map((c) => ({ ...c, rate: c.wins / c.n })).sort((a, b) => b.rate - a.rate);
  if (cats.length >= 2) {
    const best = cats[0];
    const worst = cats[cats.length - 1];
    paras.push(
      `Por categoria, ${the(s)} costuma ganhar mais em ${best.category} (menor preço em ${pct(best.rate)} das comparações) e menos em ${worst.category} (${pct(worst.rate)}).`
    );
    faq.push({
      q: `Em quais produtos ${the(s)} costuma ter o menor preço?`,
      a: `Nos últimos ${r.days} dias, principalmente em ${cats.slice(0, 2).map((c) => c.category).join(" e ")}. Em ${worst.category}, ela foi a mais barata em só ${pct(worst.rate)} das comparações.`,
    });
  }
  faq.push({
    q: `Como o Caça Ofertas compara os preços ${s.art === "a" ? "da" : "do"} ${s.name}?`,
    a: `Lemos o preço dos mesmos produtos em várias lojas duas vezes por dia e guardamos o menor preço de cada loja em cada dia. A comparação só considera dias em que o mesmo produto tinha preço em mais de uma loja. Anúncios com diferença acima de 60% (geralmente kits ou versões diferentes) ficam de fora.`,
  });
  return { paras, faq };
}
