import type { CatalogItem } from "@/components/Catalog";
import type { DailyPoint, ProductOverview } from "./types";
import type { Verdict } from "./verdict";

/**
 * Enxuga os itens da lista antes de mandar para o componente do navegador: só os campos exibidos
 * e o gráfico como uma lista de preços. Na home isso tirava ~200 KB do HTML.
 */
export function slimCatalog(items: { product: ProductOverview; verdict: Verdict; series: DailyPoint[] }[]): CatalogItem[] {
  return items.map(({ product: p, verdict: v, series }) => ({
    product: {
      id: p.id,
      slug: p.slug,
      name: p.name,
      category: p.category,
      image_url: p.image_url,
      best_price: p.best_price,
      best_store: p.best_store,
      offers_count: p.offers_count,
    },
    verdict: { kind: v.kind, label: v.label, detail: v.detail, vsAvg: v.vsAvg == null ? null : Math.round(v.vsAvg * 1000) / 1000 },
    series: series.map((x) => ({ min_price: Math.round(Number(x.min_price) * 100) / 100 })),
  }));
}
