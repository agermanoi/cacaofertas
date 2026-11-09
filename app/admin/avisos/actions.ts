"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { checkResendKey, DEFAULT_FROM, emailConfig, sendEmail } from "@/lib/email";
import { pickWeekly, weeklyEmail } from "@/lib/newsletter";
import { siteUrl } from "@/lib/site";

function back(msg: { ok?: string; erro?: string }): never {
  redirect(`/admin/avisos?${new URLSearchParams(msg as Record<string, string>)}`);
}

async function requireAdmin() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(ADMIN_COOKIE)?.value))) redirect("/admin/login");
}

export async function saveEmailSettings(formData: FormData) {
  await requireAdmin();
  const key = String(formData.get("api_key") || "").trim();
  const from = String(formData.get("from") || "").trim() || DEFAULT_FROM;
  if (!/^[^<>]*<[^\s@<>]+@[^\s@<>]+>$|^[^\s@]+@[^\s@]+$/.test(from)) back({ erro: "Remetente inválido. Ex.: Caça Ofertas <avisos@cacaofertas.com.br>" });
  const db = adminClient();
  const now = new Date().toISOString();
  if (key) {
    if (!/^re_[\w-]{10,}$/.test(key)) back({ erro: "A chave do Resend começa com re_ . Confira e cole de novo." });
    const chk = await checkResendKey(key);
    if (!chk.ok) back({ erro: `O Resend recusou a chave: ${chk.error}` });
    await db.from("kv").upsert({ key: "resend_api_key", value: key, updated_at: now });
  }
  await db.from("kv").upsert({ key: "email_from", value: from, updated_at: now });
  revalidatePath("/admin/avisos");
  back({ ok: key ? "Chave salva e aceita pelo Resend." : "Remetente salvo." });
}

export async function sendTestEmail(formData: FormData) {
  await requireAdmin();
  const to = String(formData.get("to") || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to)) back({ erro: "Informe um e-mail válido para o teste." });
  const r = await sendEmail(await emailConfig(adminClient()), {
    to,
    subject: "Teste de envio do Caça Ofertas",
    html: "<p>Se você recebeu este e-mail, os avisos de preço estão prontos para funcionar. ✅</p>",
    text: "Se você recebeu este e-mail, os avisos de preço estão prontos para funcionar.",
  });
  if (!r.ok) back({ erro: `Falhou: ${r.error}` });
  back({ ok: `E-mail de teste enviado para ${to}. Confira a caixa de entrada (e o spam).` });
}

export async function removeEmailKey() {
  await requireAdmin();
  await adminClient().from("kv").delete().eq("key", "resend_api_key");
  revalidatePath("/admin/avisos");
  back({ ok: "Chave removida. Os avisos ficam guardados sem envio." });
}

export async function sendNewsletterPreview(formData: FormData) {
  await requireAdmin();
  const to = String(formData.get("to") || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(to)) back({ erro: "Informe um e-mail válido para a prévia." });
  const db = adminClient();
  const { data: rows } = await db
    .from("product_overview")
    .select("name,slug,category,best_price,best_store,avg_30d,min_all,days_tracked,image_url")
    .not("best_price", "is", null);
  const picked = pickWeekly(rows || [], 6);
  if (!picked.length) back({ erro: "Nenhum produto abaixo da média agora: a newsletter desta semana ficaria vazia." });
  const base = siteUrl();
  const msg = weeklyEmail({
    items: picked.map((p) => ({
      name: p.name,
      slug: p.slug,
      price: Number(p.best_price),
      avg: p.avg_30d != null ? Number(p.avg_30d) : null,
      minAll: p.min_all != null ? Number(p.min_all) : null,
      store: p.best_store,
      image: p.image_url,
    })),
    base,
    dateLabel: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long" }),
    unsubscribeUrl: `${base}/newsletter/cancelar?t=previa`,
  });
  const r = await sendEmail(await emailConfig(db), { to, ...msg, subject: `[PRÉVIA] ${msg.subject}` });
  if (!r.ok) back({ erro: `Falhou: ${r.error}` });
  back({ ok: `Prévia da newsletter enviada para ${to} (${picked.length} produtos).` });
}
