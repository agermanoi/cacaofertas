import { publicClient } from "./supabase";

export interface Coupon {
  id: string;
  source: string;
  store: string;
  title: string;
  code: string | null;
  description: string | null;
  rules: string | null;
  discount: string | null;
  category: string | null;
  url: string;
  affiliate_url: string | null;
  starts_at: string | null;
  expires_at: string | null;
  highlight: boolean;
  clicks: number;
}

const COLS = "id,source,store,title,code,description,rules,discount,category,url,affiliate_url,starts_at,expires_at,highlight,clicks";

function configured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Cupons válidos agora (a política do banco já esconde os vencidos e os pausados). */
export async function getCoupons(): Promise<Coupon[]> {
  if (!configured()) return [];
  const { data, error } = await publicClient()
    .from("coupons")
    .select(COLS)
    .order("highlight", { ascending: false })
    .order("expires_at", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) {
    console.error("[coupons]", error.message);
    return [];
  }
  return (data || []) as Coupon[];
}

/** Chave para comparar nomes de loja ("Amazon.com.br" e "Amazon" viram "amazon"). */
export function storeKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\.com(\.br)?|\bloja\b|\boficial\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Cupons das lojas informadas (para a página do produto). */
export async function getCouponsForStores(stores: string[]): Promise<Coupon[]> {
  if (!stores.length) return [];
  const keys = new Set(stores.map(storeKey));
  const all = await getCoupons();
  return all.filter((c) => keys.has(storeKey(c.store)));
}

export function expiresLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "Vence hoje";
  if (days === 1) return "Vence amanhã";
  if (days <= 7) return `Vence em ${days} dias`;
  return `Válido até ${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}`;
}
