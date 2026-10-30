"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { demo } from "@/lib/mock";
import { verdictFor } from "@/lib/verdict";
import type { ProductOverview } from "@/lib/types";
import { getSocialConfig, parseSocial, pickCandidates, pickCoupons, publishPost, queueCoupon, queuePost } from "@/lib/social";

function back(msg: { ok?: string; erro?: string }): never {
  redirect(`/admin/social?${new URLSearchParams(msg as Record<string, string>)}`);
}

async function requireAdmin() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(ADMIN_COOKIE)?.value))) redirect("/admin/login");
  if (demo.enabled()) back({ erro: "Modo demonstração: as alterações não são salvas." });
}

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const on = (f: FormData, k: string) => f.get(k) === "on";

export async function saveSocial(formData: FormData) {
  await requireAdmin();
  const cfg = parseSocial({
    enabled: on(formData, "enabled"),
    mode: text(formData, "mode"),
    perRun: Number(text(formData, "perRun")),
    instagram: on(formData, "instagram"),
    facebook: on(formData, "facebook"),
    story: on(formData, "story"),
    tiktok: on(formData, "tiktok"),
    repeatDays: Number(text(formData, "repeatDays")),
    minDrop: Number(text(formData, "minDrop")),
    fallback: on(formData, "fallback"),
    hashtags: text(formData, "hashtags"),
    footer: text(formData, "footer"),
    productHours: text(formData, "productHours"),
    coupons: on(formData, "coupons"),
    couponHours: text(formData, "couponHours"),
    couponMinPct: Number(text(formData, "couponMinPct")),
  });
  const { error } = await adminClient()
    .from("kv")
    .upsert({ key: "social_config", value: JSON.stringify(cfg), updated_at: new Date().toISOString() });
  if (error) back({ erro: `Não foi possível salvar: ${error.message}` });
  revalidatePath("/admin/social");
  back({ ok: "Configurações das redes salvas." });
}

/** Cria um post na fila para um produto escolhido (ou as próximas ofertas) e, se pedido, publica já. */
export async function createPost(formData: FormData) {
  await requireAdmin();
  const db = adminClient();
  const cfg = await getSocialConfig(db);
  const slug = text(formData, "slug");
  const now = on(formData, "now");

  let list;
  if (slug === "__cupom") {
    const coupons = await pickCoupons(db, cfg, 1);
    if (!coupons.length) back({ erro: "Nenhum cupom novo para postar agora (os bons já foram postados nos últimos dias)." });
    let cid: number;
    try {
      cid = await queueCoupon(db, coupons[0], cfg);
    } catch (e) {
      back({ erro: `Não foi possível gerar a arte do cupom: ${(e as Error).message}` });
    }
    if (now) {
      const r = await publishPost(db, cid, cfg);
      revalidatePath("/admin/social");
      if (!r.ok) back({ erro: `Não publicou: ${r.error}` });
      back({ ok: r.error ? `Cupom publicado com avisos: ${r.error}` : `Cupom ${coupons[0].store} publicado!` });
    }
    revalidatePath("/admin/social");
    back({ ok: `Cupom ${coupons[0].store} criado na fila.` });
  }
  if (slug) {
    const { data } = await db.from("product_overview").select("*").eq("slug", slug).not("best_price", "is", null).maybeSingle();
    if (!data) back({ erro: "Produto sem preço no momento." });
    const p = data as ProductOverview;
    list = [{ p, v: verdictFor(p), reason: "popular" as const }];
  } else {
    list = await pickCandidates(db, cfg, 1);
    if (!list.length) back({ erro: "Nenhuma oferta nova para postar agora (todas já foram postadas nos últimos dias)." });
  }

  let id: number;
  try {
    id = await queuePost(db, list[0], cfg);
  } catch (e) {
    back({ erro: `Não foi possível gerar a arte: ${(e as Error).message}` });
  }
  if (now) {
    const r = await publishPost(db, id, cfg);
    revalidatePath("/admin/social");
    if (!r.ok) back({ erro: `Não publicou: ${r.error}` });
    back({ ok: r.error ? `Publicado com avisos: ${r.error}` : "Publicado!" });
  }
  revalidatePath("/admin/social");
  back({ ok: "Post criado na fila. Revise a legenda e clique em Publicar." });
}

export async function publishQueued(formData: FormData) {
  await requireAdmin();
  const db = adminClient();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) back({ erro: "Post inválido." });
  const caption = String(formData.get("caption") ?? "").replace(/\r\n/g, "\n").trim();
  const fb = String(formData.get("fb_caption") ?? "").replace(/\r\n/g, "\n").trim();
  if (caption) await db.from("social_posts").update({ caption: caption.slice(0, 2200), fb_caption: (fb || caption).slice(0, 5000) }).eq("id", id);
  const r = await publishPost(db, id);
  revalidatePath("/admin/social");
  if (!r.ok) back({ erro: `Não publicou: ${r.error}` });
  back({ ok: r.error ? `Publicado com avisos: ${r.error}` : "Publicado!" });
}

export async function saveCaption(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const caption = String(formData.get("caption") ?? "").replace(/\r\n/g, "\n").trim();
  const fb = String(formData.get("fb_caption") ?? "").replace(/\r\n/g, "\n").trim();
  if (Number.isFinite(id) && caption)
    await adminClient().from("social_posts").update({ caption: caption.slice(0, 2200), fb_caption: (fb || caption).slice(0, 5000) }).eq("id", id);
  revalidatePath("/admin/social");
  back({ ok: "Legenda salva." });
}

export async function discardPost(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (Number.isFinite(id))
    await adminClient().from("social_posts").update({ status: "discarded" }).eq("id", id).in("status", ["queued", "failed"]);
  revalidatePath("/admin/social");
  back({ ok: "Post descartado." });
}

/** Post publicado em parte (ex.: saiu no Facebook e falhou no Instagram): tenta só o que faltou. */
export async function retryPost(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) back({ erro: "Post inválido." });
  const r = await publishPost(adminClient(), id);
  revalidatePath("/admin/social");
  if (r.error) back({ erro: `Ainda com erro: ${r.error}` });
  back({ ok: "Publicado no que faltava!" });
}
