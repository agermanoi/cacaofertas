"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { slugify } from "@/lib/slug";

async function requireAdmin() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(ADMIN_COOKIE)?.value))) redirect("/admin/login");
}

function back(path: string, msg: { ok?: string; erro?: string }): never {
  redirect(`${path}?${new URLSearchParams(msg as Record<string, string>)}`);
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function refresh(slug?: string) {
  revalidatePath("/", "layout");
  revalidatePath("/datas");
  if (slug) revalidatePath(`/datas/${slug}`);
  revalidatePath("/admin/datas");
}

export async function saveEvent(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id") || null;
  const formPath = id ? `/admin/datas/${id}` : "/admin/datas/nova";
  const name = text(formData, "name").slice(0, 40);
  const date = text(formData, "date");
  const slug = slugify(text(formData, "slug") || name.replace(/\./g, "-"));
  if (!name) back(formPath, { erro: "Dê um nome para a data." });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) back(formPath, { erro: "Escolha a data." });
  if (!slug) back(formPath, { erro: "Endereço da página inválido." });
  const article = ["o", "a", "os", "as"].includes(text(formData, "article")) ? text(formData, "article") : "o";
  const row = {
    name,
    slug,
    article,
    date,
    yearly: formData.get("yearly") === "on",
    intro: text(formData, "intro").slice(0, 1200),
    terms: text(formData, "terms")
      .split(/[,\n]+/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20),
    countdown: formData.get("countdown") === "on",
    countdown_days: Math.min(120, Math.max(0, Number(text(formData, "countdown_days")) || 15)),
    page: formData.get("page") === "on",
    extra_posts: formData.get("extra_posts") === "on",
    active: formData.get("active") === "on",
    updated_at: new Date().toISOString(),
  };
  const db = adminClient();
  const { error } = id ? await db.from("events").update(row).eq("id", id) : await db.from("events").insert(row);
  if (error) back(formPath, { erro: error.message.includes("duplicate") ? "Já existe uma data com esse endereço." : error.message });
  refresh(slug);
  back("/admin/datas", { ok: `${name} salvo.` });
}

export async function deleteEvent(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  if (id) await adminClient().from("events").delete().eq("id", id);
  refresh();
  back("/admin/datas", { ok: "Data excluída." });
}
