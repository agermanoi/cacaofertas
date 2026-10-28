"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { demo } from "@/lib/mock";

async function requireAdmin() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(ADMIN_COOKIE)?.value))) redirect("/admin/login");
  if (demo.enabled()) back("/admin/cupons", { erro: "Modo demonstração: as alterações não são salvas." });
}

function back(path: string, msg: { ok?: string; erro?: string }): never {
  redirect(`${path}?${new URLSearchParams(msg as Record<string, string>)}`);
}

function refresh() {
  revalidatePath("/cupons");
  revalidatePath("/produto/[slug]", "page");
}

const text = (f: FormData, k: string, max = 500) => String(f.get(k) ?? "").trim().slice(0, max);

/** "2026-11-30T23:59" (horário de Brasília, vindo do input datetime-local) → ISO. */
function brDate(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}${v.length === 16 ? ":00" : ""}-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function saveCoupon(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id", 64);
  const path = id ? `/admin/cupons/${id}` : "/admin/cupons/novo";

  const store = text(formData, "store", 120);
  const title = text(formData, "title", 200);
  const url = text(formData, "url", 2000);
  if (!store || !title || !url) back(path, { erro: "Preencha loja, título e link da loja." });
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) throw new Error();
  } catch {
    back(path, { erro: "O link da loja precisa começar com https://" });
  }
  const aff = text(formData, "affiliate_url", 2000);
  if (aff && !/^https?:\/\//.test(aff)) back(path, { erro: "O link de afiliado precisa começar com https://" });

  const starts = brDate(text(formData, "starts_at", 20));
  const expires = brDate(text(formData, "expires_at", 20));
  if (starts && expires && new Date(expires) <= new Date(starts)) back(path, { erro: "A validade precisa ser depois do início." });

  const row = {
    store,
    title,
    code: text(formData, "code", 80).replace(/\s+/g, "") || null,
    discount: text(formData, "discount", 40) || null,
    description: text(formData, "description", 600) || null,
    rules: text(formData, "rules", 1500) || null,
    category: text(formData, "category", 80) || null,
    url,
    affiliate_url: aff || null,
    starts_at: starts,
    expires_at: expires,
    highlight: formData.get("highlight") === "on",
    active: formData.get("active") === "on",
    updated_at: new Date().toISOString(),
  };

  const db = adminClient();
  const { error } = id
    ? await db.from("coupons").update(row).eq("id", id)
    : await db.from("coupons").insert({ ...row, source: "manual" });
  if (error) back(path, { erro: `Não foi possível salvar: ${error.message}` });

  refresh();
  back("/admin/cupons", { ok: id ? "Cupom atualizado." : "Cupom criado e já está no site." });
}

export async function setCouponActive(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id", 64);
  const active = formData.get("active") === "1";
  await adminClient().from("coupons").update({ active, updated_at: new Date().toISOString() }).eq("id", id);
  refresh();
  back("/admin/cupons", { ok: active ? "Cupom reativado." : "Cupom pausado." });
}

export async function deleteCoupon(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id", 64);
  await adminClient().from("coupons").delete().eq("id", id);
  refresh();
  back("/admin/cupons", { ok: "Cupom excluído." });
}

export async function purgeExpired() {
  await requireAdmin();
  const { count } = await adminClient()
    .from("coupons")
    .delete({ count: "exact" })
    .lt("expires_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
  refresh();
  back("/admin/cupons", { ok: `${count ?? 0} cupons vencidos há mais de 7 dias foram apagados.` });
}
