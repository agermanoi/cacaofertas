import { getOverview } from "./data";
import { isInflated, verdictFor, type Verdict } from "./verdict";
import type { ProductOverview } from "./types";

/** Tamanhos dos anúncios da casa (Google Ad Manager). */
export const HOUSE_SIZES = {
  "970x250": { w: 970, h: 250, n: 3 },
  "728x90": { w: 728, h: 90, n: 1 },
  "300x250": { w: 300, h: 250, n: 3 },
  "320x100": { w: 320, h: 100, n: 1 },
} as const;
export type HouseSize = keyof typeof HOUSE_SIZES;

export interface HouseItem {
  p: ProductOverview;
  v: Verdict;
  badge: string;
}

/** Selo curto para o anúncio. */
export function houseBadge(v: Verdict): string {
  if (v.kind === "record") return "Menor preço já visto";
  if (v.kind === "below") return `${Math.round((v.vsAvg || 0) * 100)}% abaixo da média`;
  return "Menor preço de hoje";
}

/** Produtos do anúncio: quedas reais primeiro, depois os mais buscados com foto (nunca desconto inflado). */
export async function houseProducts(n: number): Promise<HouseItem[]> {
  const all = (await getOverview()).filter((p) => p.image_url && p.best_price != null);
  const items = all.map((p) => ({ p, v: verdictFor(p) })).filter((i) => !isInflated(i.v.kind) && i.v.kind !== "above");
  const real = items
    .filter((i) => i.v.kind === "record" || i.v.kind === "below")
    .sort((a, b) => (b.v.vsAvg || 0) - (a.v.vsAvg || 0));
  const seenCat = new Set<string>();
  const rest = items
    .filter((i) => !real.includes(i))
    .sort((a, b) => b.p.popularity - a.p.popularity)
    .filter((i) => (seenCat.has(i.p.category) ? false : (seenCat.add(i.p.category), true)));
  return [...real, ...rest].slice(0, n).map((i) => ({ ...i, badge: houseBadge(i.v) }));
}
