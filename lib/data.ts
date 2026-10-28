import { publicClient } from "./supabase";
import type { DailyPoint, OfferRow, ProductOverview } from "./types";
import { demo } from "./mock";

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);
}

/** Em build sem variáveis de ambiente, devolve vazio em vez de quebrar. */
function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Produtos visíveis no site: ativos E com preço encontrado nos últimos dias.
 * Produto recém-cadastrado só aparece depois que a coleta acha o primeiro preço,
 * e some das listas enquanto nenhuma loja tiver estoque.
 */
export async function getOverview(): Promise<ProductOverview[]> {
  if (demo.enabled()) return demo.overview().filter((p) => p.best_price != null);
  if (!configured()) return [];
  const { data, error } = await publicClient()
    .from("product_overview")
    .select("*")
    .eq("active", true)
    .not("best_price", "is", null)
    .order("popularity", { ascending: false });
  if (error) {
    console.error("[data] overview:", error.message);
    return [];
  }
  return (data || []) as ProductOverview[];
}

export async function getProductBySlug(slug: string): Promise<ProductOverview | null> {
  if (demo.enabled()) return demo.bySlug(slug);
  if (!configured()) return null;
  const { data, error } = await publicClient().from("product_overview").select("*").eq("slug", slug).maybeSingle();
  if (error) console.error("[data] product:", error.message);
  return (data as ProductOverview) || null;
}

/** Série diária (menor preço entre as lojas) por produto. */
export async function getDailySeries(productIds: string[], days = 30): Promise<Map<string, DailyPoint[]>> {
  if (demo.enabled()) return demo.daily(productIds, days);
  const out = new Map<string, DailyPoint[]>();
  if (!configured() || !productIds.length) return out;
  const { data, error } = await publicClient()
    .from("product_daily")
    .select("product_id, day, min_price")
    .in("product_id", productIds)
    .gte("day", daysAgo(days))
    .order("day", { ascending: true })
    .limit(10000);
  if (error) {
    console.error("[data] daily:", error.message);
    return out;
  }
  for (const r of data || []) {
    const list = out.get(r.product_id) || [];
    list.push({ day: r.day, min_price: Number(r.min_price) });
    out.set(r.product_id, list);
  }
  return out;
}

export interface StoreSeries {
  store: string;
  points: DailyPoint[];
}

/** Série por loja (menor preço da loja no dia) — para o gráfico do produto. */
export async function getStoreSeries(productId: string, days = 90): Promise<StoreSeries[]> {
  if (demo.enabled()) return demo.stores(productId);
  if (!configured()) return [];
  const { data, error } = await publicClient()
    .from("price_history")
    .select("price, captured_on, offers!inner(store)")
    .eq("product_id", productId)
    .gte("captured_on", daysAgo(days))
    .order("captured_on", { ascending: true })
    .limit(10000);
  if (error) {
    console.error("[data] store series:", error.message);
    return [];
  }
  const byStore = new Map<string, Map<string, number>>();
  for (const r of data as any[]) {
    const store = String(Array.isArray(r.offers) ? r.offers[0]?.store : r.offers?.store);
    const m = byStore.get(store) || new Map<string, number>();
    const prev = m.get(r.captured_on);
    if (prev == null || Number(r.price) < prev) m.set(r.captured_on, Number(r.price));
    byStore.set(store, m);
  }
  return [...byStore.entries()]
    .map(([store, m]) => ({
      store,
      points: [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, min_price]) => ({ day, min_price })),
    }))
    .sort((a, b) => b.points.length - a.points.length);
}

export async function getOffers(productId: string): Promise<OfferRow[]> {
  if (demo.enabled()) return demo.offers(productId);
  if (!configured()) return [];
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data, error } = await publicClient()
    .from("offers")
    .select("id, product_id, source, store, title, url, affiliate_url, image_url, last_price, last_list_price, last_seen_at")
    .eq("product_id", productId)
    .eq("active", true)
    .gte("last_seen_at", since)
    .not("last_price", "is", null)
    .order("last_price", { ascending: true })
    .limit(30);
  if (error) console.error("[data] offers:", error.message);
  return (data || []) as OfferRow[];
}
