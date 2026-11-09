import { adminClient } from "@/lib/supabase";
import { demo } from "@/lib/mock";

/** Nomes de loja já usados nas ofertas e cupons (sugestões no formulário). */
export async function knownStores(): Promise<string[]> {
  if (demo.enabled()) return [];
  const db = adminClient();
  const [{ data: offers }, { data: coupons }] = await Promise.all([
    db.from("offers").select("store").eq("active", true).limit(2000),
    db.from("coupons").select("store").limit(1000),
  ]);
  const set = new Set<string>();
  for (const r of [...(offers || []), ...(coupons || [])]) if (r.store) set.add(String(r.store));
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Produtos ativos (para vincular um cupom a um produto específico). */
export async function productOptions(): Promise<{ id: string; name: string }[]> {
  if (demo.enabled()) return [];
  const { data } = await adminClient().from("products").select("id,name").eq("active", true).order("name");
  return (data || []) as { id: string; name: string }[];
}
