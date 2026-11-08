import type { DailyPoint, OfferRow, ProductOverview } from "./types";
import type { StoreSeries } from "./data";
import type { Verdict } from "./verdict";
import { money } from "./format";

/**
 * Análise em texto do histórico de um produto, escrita a partir dos dados coletados
 * (faixa de preço, tendência da semana, loja mais barata, desconto anunciado vs real).
 * Cada página ganha um texto próprio, baseado só em números que o site mediu.
 */

const pctStr = (x: number) => `${Math.round(Math.abs(x) * 100)}%`;
const dm = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

/** artigo da loja: "o Mercado Livre", "a Amazon", "as Casas Bahia" */
function art(store: string): string {
  const s = store.trim();
  if (/^casas\b/i.test(s)) return "as";
  if (/^(mercado|carrefour|extra|ponto|pão de açúcar|walmart|submarino|shoptime|kabum)/i.test(s)) return "o";
  return "a";
}
const the = (s: string) => `${art(s)} ${s}`;
const at = (s: string) => `${({ o: "no", a: "na", as: "nas" } as Record<string, string>)[art(s)]} ${s}`;

function storeOn(stores: StoreSeries[], day: string, price: number): string | null {
  for (const s of stores) {
    const pt = s.points.find((x) => x.day === day);
    if (pt && Math.abs(Number(pt.min_price) - price) < 0.01) return s.store;
  }
  return null;
}

export function productAnalysis(
  p: ProductOverview,
  v: Verdict,
  best: DailyPoint[],
  stores: StoreSeries[],
  offers: OfferRow[]
): string[] {
  const hist = best.map((x) => ({ day: x.day, price: Number(x.min_price) })).filter((x) => x.price > 0);
  if (hist.length < 3) return [];
  const out: string[] = [];
  const days = Number(p.days_tracked || hist.length);
  const nStores = new Set([...stores.map((s) => s.store), ...offers.map((o) => o.store)]).size;

  // 1. faixa de preço no período
  const lo = hist.reduce((a, b) => (b.price < a.price ? b : a));
  const hi = hist.reduce((a, b) => (b.price > a.price ? b : a));
  const loStore = storeOn(stores, lo.day, lo.price);
  const spread = hi.price > 0 ? (hi.price - lo.price) / hi.price : 0;
  let s1 = `O Caça Ofertas acompanha este produto há ${days} ${days === 1 ? "dia" : "dias"}${nStores > 1 ? `, em ${nStores} lojas` : ""}. `;
  if (spread < 0.02) {
    s1 += `Nesse período o preço quase não mudou: ficou perto de ${money(lo.price)} o tempo todo.`;
  } else {
    s1 += `O menor preço foi ${money(lo.price)} em ${dm(lo.day)}${loStore ? `, ${at(loStore)}` : ""}, e o maior foi ${money(hi.price)} em ${dm(hi.day)}: uma diferença de ${pctStr(spread)} entre o pico e o fundo.`;
  }
  out.push(s1);

  // 2. tendência dos últimos 7 dias
  const last = hist[hist.length - 1];
  const ref = [...hist].reverse().find((x) => Date.parse(last.day) - Date.parse(x.day) >= 6 * 86_400_000);
  if (ref) {
    const ch = (last.price - ref.price) / ref.price;
    out.push(
      Math.abs(ch) < 0.02
        ? `Na última semana o preço ficou estável, em torno de ${money(last.price)}.`
        : `Na última semana o menor preço ${ch < 0 ? "caiu" : "subiu"} ${pctStr(ch)}, de ${money(ref.price)} (${dm(ref.day)}) para ${money(last.price)} (${dm(last.day)}).`
    );
  }

  // 3. qual loja costuma ser mais barata (últimos 14 dias, dias com 2+ lojas)
  if (stores.length >= 2) {
    const since = Date.parse(last.day) - 13 * 86_400_000;
    const wins = new Map<string, number>();
    const rel = new Map<string, number[]>();
    let compared = 0;
    for (const d of hist.filter((x) => Date.parse(x.day) >= since)) {
      const today = stores
        .map((s) => ({ store: s.store, price: Number(s.points.find((x) => x.day === d.day)?.min_price || 0) }))
        .filter((x) => x.price > 0);
      if (today.length < 2) continue;
      compared++;
      const min = Math.min(...today.map((x) => x.price));
      const w = today.find((x) => x.price === min)!;
      wins.set(w.store, (wins.get(w.store) || 0) + 1);
      for (const x of today) if (x.store !== w.store) rel.set(x.store, [...(rel.get(x.store) || []), (x.price - min) / min]);
    }
    if (compared >= 3) {
      const [top, n] = [...wins.entries()].sort((a, b) => b[1] - a[1])[0];
      const other = [...rel.entries()]
        .filter(([s, xs]) => s !== top && xs.length >= 2)
        .map(([s, xs]) => ({ s, avg: xs.reduce((a, b) => a + b, 0) / xs.length }))
        .sort((a, b) => a.avg - b.avg)[0];
      let s3 =
        n === compared
          ? `Nos ${compared} dias em que comparamos mais de uma loja, ${the(top)} teve o menor preço em todos.`
          : `Nos ${compared} dias em que comparamos mais de uma loja, ${the(top)} teve o menor preço em ${n}.`;
      if (n < compared && other && other.avg >= 0.01) s3 += ` Quando não era a mais barata, ${the(other.s)} ficava em média ${pctStr(other.avg)} acima.`;
      out.push(s3);
    }
  }

  // 4. desconto anunciado vs desconto real
  const price = p.best_price != null ? Number(p.best_price) : null;
  const list = p.best_list_price != null ? Number(p.best_list_price) : null;
  const avg = p.avg_30d != null ? Number(p.avg_30d) : null;
  if (price != null && list != null && list > price * 1.02 && avg != null && days >= 5) {
    const who = p.best_store ? the(p.best_store) : "a loja";
    const Who = who.charAt(0).toUpperCase() + who.slice(1);
    const announced = (list - price) / list;
    const real = (avg - price) / avg;
    out.push(
      real >= 0.02
        ? `${Who} anuncia ${pctStr(announced)} de desconto (de ${money(list)} por ${money(price)}). Comparado com a média que medimos, a queda real é de ${pctStr(real)}.`
        : real > -0.02
          ? `${Who} anuncia ${pctStr(announced)} de desconto (de ${money(list)} por ${money(price)}), mas o preço de hoje está na média do período: o desconto real é praticamente zero.`
          : `${Who} anuncia ${pctStr(announced)} de desconto (de ${money(list)} por ${money(price)}), mas o preço de hoje está ${pctStr(real)} acima da média que medimos.`
    );
  }

  // 5. distância do menor preço já registrado
  const minAll = p.min_all != null ? Number(p.min_all) : null;
  if (price != null && minAll != null && v.kind !== "learning") {
    const gap = (price - minAll) / minAll;
    out.push(
      gap <= 0.005
        ? `O preço de hoje empata com o menor que já registramos para este produto.`
        : `O menor preço que já registramos foi ${money(minAll)}; hoje está ${pctStr(gap)} acima disso${gap > 0.1 ? ", então vale acompanhar antes de comprar" : ""}.`
    );
  }
  return out;
}
