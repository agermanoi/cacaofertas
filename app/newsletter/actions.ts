"use server";

import { adminClient } from "@/lib/supabase";
import { demo } from "@/lib/mock";
import { siteUrl } from "@/lib/site";
import { emailConfig, sendEmail } from "@/lib/email";
import { newsletterConfirmEmail } from "@/lib/newsletter";

export interface NewsletterState {
  ok?: string;
  erro?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Inscreve (ou reativa) um e-mail. Se ele já confirmou um aviso de preço, não pede confirmação de novo. */
export async function addSubscriber(email: string, source: string): Promise<NewsletterState> {
  const db = adminClient();
  const { data: existing } = await db.from("newsletter_subscribers").select("id,token,confirmed_at,canceled_at,confirm_sent_at").ilike("email", email).maybeSingle();
  if (existing?.confirmed_at && !existing.canceled_at) return { ok: "Você já recebe as Quedas da semana. 🙂" };

  const { data: known } = await db.from("price_alerts").select("id").eq("email", email).not("confirmed_at", "is", null).limit(1);
  const verified = Boolean(known?.length);
  const now = new Date().toISOString();

  let row = existing;
  if (existing) {
    await db
      .from("newsletter_subscribers")
      .update({ canceled_at: null, confirmed_at: existing.confirmed_at ?? (verified ? now : null), source })
      .eq("id", existing.id);
    if (verified || existing.confirmed_at) return { ok: "Pronto! Você volta a receber as Quedas da semana toda quinta." };
  } else {
    const { data, error } = await db
      .from("newsletter_subscribers")
      .insert({ email, source, confirmed_at: verified ? now : null })
      .select("id,token,confirmed_at,canceled_at,confirm_sent_at")
      .single();
    if (error || !data) return { erro: "Não foi possível fazer a inscrição agora. Tente de novo em alguns minutos." };
    row = data;
    if (verified) return { ok: "Pronto! Você vai receber as Quedas da semana toda quinta à noite." };
  }

  const recent = row!.confirm_sent_at && Date.now() - Date.parse(row!.confirm_sent_at) < 10 * 60_000;
  if (!recent) {
    const base = siteUrl();
    const msg = newsletterConfirmEmail({
      confirmUrl: `${base}/newsletter/confirmar?t=${row!.token}`,
      cancelUrl: `${base}/newsletter/cancelar?t=${row!.token}`,
    });
    const sent = await sendEmail(await emailConfig(db), { to: email, ...msg });
    if (!sent.ok) return { ok: "Inscrição guardada! Em breve você recebe um e-mail para confirmar." };
    await db.from("newsletter_subscribers").update({ confirm_sent_at: now }).eq("id", row!.id);
  }
  return { ok: "Quase lá! Enviamos um e-mail para confirmar a inscrição. Confira também o spam." };
}

export async function subscribeNewsletter(_prev: NewsletterState, formData: FormData): Promise<NewsletterState> {
  if (String(formData.get("hp") || "")) return { ok: "Quase lá! Confira seu e-mail para confirmar." };
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 200);
  if (!EMAIL_RE.test(email)) return { erro: "Confira o e-mail: ele não parece válido." };
  if (demo.enabled()) return { ok: "Quase lá! Confira seu e-mail para confirmar." };
  const source = String(formData.get("source") || "site").slice(0, 40);
  return addSubscriber(email, source);
}

export async function cancelNewsletter(formData: FormData): Promise<void> {
  const token = String(formData.get("t") || "");
  if (!/^[a-f0-9]{36}$/.test(token)) return;
  await adminClient().from("newsletter_subscribers").update({ canceled_at: new Date().toISOString() }).eq("token", token).is("canceled_at", null);
  const { redirect } = await import("next/navigation");
  redirect(`/newsletter/cancelar?t=${token}&ok=1`);
}
