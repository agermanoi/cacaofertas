/**
 * Dados fictícios para ver o site sem Supabase: DEMO_DATA=1 npm run dev
 * Gera 45 dias de histórico determinístico para os produtos de data/products.json.
 */
import seeds from "@/data/products.json";
import type { DailyPoint, OfferRow, ProductOverview } from "./types";
import type { StoreSeries } from "./data";

const STORES = ["Amazon", "Mercado Livre", "Magalu", "KaBuM!", "Casas Bahia"];

function rand(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function day(n: number) {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

interface Mock {
  overview: ProductOverview;
  stores: StoreSeries[];
  daily: DailyPoint[];
  offers: OfferRow[];
}

let cache: Mock[] | null = null;

function build(): Mock[] {
  if (cache) return cache;
  cache = seeds.map((s, idx) => {
    const r = rand(idx + 7);
    const base = (s.min_price || 300) * (1.25 + r() * 0.2);
    const scenario = idx % 5; // 0 queda real, 1 maquiado, 2 normal, 3 alta, 4 recorde
    const stores: StoreSeries[] = STORES.slice(0, 3 + (idx % 3)).map((store, k) => {
      const points: DailyPoint[] = [];
      for (let d = 45; d >= 0; d--) {
        let v = base * (1 + k * 0.03) * (1 + (r() - 0.5) * 0.05);
        if (d < 4 && (scenario === 0 || scenario === 4)) v *= scenario === 4 ? 0.8 : 0.88;
        if (d < 6 && scenario === 3) v *= 1.09;
        points.push({ day: day(d), min_price: Math.round(v * 100) / 100 });
      }
      return { store, points };
    });
    const daily = stores[0].points.map((p, i) => ({
      day: p.day,
      min_price: Math.min(...stores.map((st) => st.points[i].min_price)),
    }));
    const last30 = daily.slice(-31, -1).map((d) => d.min_price);
    const today = daily[daily.length - 1].min_price;
    const bestStore = stores.reduce((a, b) => (a.points.at(-1)!.min_price < b.points.at(-1)!.min_price ? a : b));
    const id = `00000000-0000-4000-8000-${String(idx).padStart(12, "0")}`;
    const offers: OfferRow[] = stores
      .map((st, k) => ({
        id: `${id.slice(0, -2)}${String(k).padStart(2, "0")}`,
        product_id: id,
        source: "serpapi" as const,
        store: st.store,
        title: `${s.name} (anúncio de exemplo)`,
        url: "https://example.com",
        affiliate_url: null,
        image_url: null,
        last_price: st.points.at(-1)!.min_price,
        last_list_price: scenario === 1 ? Math.round(st.points.at(-1)!.min_price * 1.9) : null,
        last_seen_at: new Date().toISOString(),
      }))
      .sort((a, b) => Number(a.last_price) - Number(b.last_price));

    const overview: ProductOverview = {
      id,
      slug: s.slug,
      name: s.name,
      category: s.category,
      image_url: null,
      popularity: s.popularity,
      active: true,
      best_price: today,
      best_list_price: offers[0].last_list_price,
      best_offer_id: offers[0].id,
      best_store: bestStore.store,
      offers_count: offers.length,
      min_30d: Math.min(...daily.slice(-31).map((d) => d.min_price)),
      avg_30d: Math.round((last30.reduce((a, b) => a + b, 0) / last30.length) * 100) / 100,
      max_30d: Math.max(...daily.slice(-31).map((d) => d.min_price)),
      min_90d: Math.min(...daily.map((d) => d.min_price)),
      min_all: Math.min(...daily.map((d) => d.min_price)),
      days_tracked: daily.length,
    };
    return { overview, stores, daily, offers };
  });
  return cache;
}

export const demo = {
  enabled: () => process.env.DEMO_DATA === "1",
  overview: () => build().map((m) => m.overview).sort((a, b) => b.popularity - a.popularity),
  bySlug: (slug: string) => build().find((m) => m.overview.slug === slug)?.overview ?? null,
  daily: (ids: string[], days: number) =>
    new Map(build().filter((m) => ids.includes(m.overview.id)).map((m) => [m.overview.id, m.daily.slice(-days - 1)])),
  stores: (id: string) => build().find((m) => m.overview.id === id)?.stores ?? [],
  offers: (id: string) => build().find((m) => m.overview.id === id)?.offers ?? [],
};
