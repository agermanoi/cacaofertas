import "server-only";
import { adminClient } from "./supabase";
import { demo } from "./mock";
import seeds from "@/data/products.json";
import type { OfferRow, Product, ProductOverview } from "./types";

export function adminDbReady(): boolean {
  return demo.enabled() || Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Todos os produtos (ativos e pausados) com o melhor preço atual. */
export async function adminListProducts(): Promise<ProductOverview[]> {
  if (demo.enabled()) {
    return demo.overview().map((p, i) => ({ ...p, active: i % 9 !== 8 }));
  }
  const { data, error } = await adminClient()
    .from("product_overview")
    .select("*")
    .order("active", { ascending: false })
    .order("popularity", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as ProductOverview[];
}

export async function adminGetProduct(id: string): Promise<Product | null> {
  if (demo.enabled()) {
    const o = demo.overview().find((p) => p.id === id);
    const s = o && seeds.find((x) => x.slug === o.slug);
    if (!o || !s) return null;
    return {
      id: o.id,
      slug: s.slug,
      name: s.name,
      category: s.category,
      query: s.query,
      must: s.must,
      exclude: s.exclude,
      min_price: s.min_price,
      max_price: null,
      scrape_urls: [],
      image_url: null,
      popularity: s.popularity,
      active: true,
      specs: null,
    };
  }
  const { data } = await adminClient().from("products").select("*").eq("id", id).maybeSingle();
  return (data as Product) || null;
}

/** Ofertas vistas nos últimos 3 dias: ajuda a calibrar os filtros. */
export async function adminRecentOffers(productId: string): Promise<OfferRow[]> {
  if (demo.enabled()) return demo.offers(productId);
  const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data } = await adminClient()
    .from("offers")
    .select("id, product_id, source, store, title, url, affiliate_url, image_url, last_price, last_list_price, last_seen_at")
    .eq("product_id", productId)
    .gte("last_seen_at", since)
    .order("last_price", { ascending: true })
    .limit(20);
  return (data || []) as OfferRow[];
}

export async function adminCategories(): Promise<string[]> {
  const base = ["Smartphones", "Games", "TVs", "Informática", "Eletroportáteis", "Áudio e Wearables", "Casa inteligente"];
  if (demo.enabled()) return base;
  const { data } = await adminClient().from("products").select("category");
  return Array.from(new Set([...(data || []).map((r) => r.category as string), ...base])).sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  );
}
