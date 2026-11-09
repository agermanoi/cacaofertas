"use server";

import { adminClient } from "@/lib/supabase";
import { demo } from "@/lib/mock";
import { siteUrl } from "@/lib/site";
import { confirmEmail } from "@/lib/alerts";
import { emailConfig, sendEmail } from "@/lib/email";

export interface AlertState {
  ok?: string;
  erro?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function parsePrice(v: string): number | null | undefined {
  const s = v.replace(/[^\d,.]/g, "");
  if (!s) return null;
  const n = Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

export async function subscribeAlert(_prev: AlertState, formData: FormData): Promise<AlertState> {
  // campo invisível: pessoas não preenchem, robôs sim
  if (String(formData.get("hp") || "")) return { ok: "Pronto! Confira seu e-mail para confirmar o aviso." };

  const productId = String(formData.get("product_id") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase().slice(0, 200);
  const target = parsePrice(String(formData.get("target") || ""));
  if (!EMAIL_RE.test(email)) return { erro: "Confira o e-mail: ele não parece válido." };
  if (target === undefined) return { erro: "O preço desejado não parece um valor válido. Ex.: 1.899,90" };
  if (formData.get("consent") !== "on") return { erro: "Marque a caixa para concordar em receber os avisos." };
  if (demo.enabled()) return { ok: "Pronto! Confira seu e-mail para confirmar o aviso." };

  const db = adminClient();
  const { data: p } = await db.from("product_overview").select("id,name,slug,best_price").eq("id", productId).maybeSingle();
  if (!p) return { erro: "Produto não encontrado." };
  const price = p.best_price != null ? Number(p.best_price) : null;
  if (target != null && price != null && target >= price)
    return { erro: `O preço de hoje já é ${price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}. Escolha um valor abaixo disso, ou deixe em branco para ser avisado de qualquer queda.` };

  // limite simples contra abuso: 15 inscrições por e-mail por dia
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await db.from("price_alerts").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", since);
  if ((count ?? 0) >= 15) return { erro: "Muitos avisos criados com este e-mail hoje. Tente de novo amanhã." };

  // e-mail já confirmado antes em outro aviso: não pede confirmação de novo
  const { data: known } = await db
    .from("price_alerts")
    .select("id")
    .eq("email", email)
    .not("confirmed_at", "is", null)
    .limit(1);
  const verified = Boolean(known?.length);

  const { data: existing } = await db
    .from("price_alerts")
    .select("id,token,confirmed_at,confirm_sent_at")
    .eq("product_id", p.id)
    .eq("email", email)
    .is("canceled_at", null)
    .maybeSingle();

  let row = existing;
  if (existing) {
    await db.from("price_alerts").update({ target_price: target, price_at_signup: price }).eq("id", existing.id);
    if (existing.confirmed_at) return { ok: "Você já tinha esse aviso ativo. Atualizamos o preço desejado." };
  } else {
    const { data, error } = await db
      .from("price_alerts")
      .insert({ product_id: p.id, email, target_price: target, price_at_signup: price, confirmed_at: verified ? new Date().toISOString() : null })
      .select("id,token,confirmed_at,confirm_sent_at")
      .single();
    if (error || !data) return { erro: "Não foi possível criar o aviso agora. Tente de novo em alguns minutos." };
    row = data;
    if (verified) return { ok: "Aviso ativado! Vamos te mandar um e-mail quando o preço cair." };
  }

  // confirmação por e-mail (sem a chave do Resend, fica pendente e sai na próxima rodada)
  const recent = row!.confirm_sent_at && Date.now() - Date.parse(row!.confirm_sent_at) < 10 * 60_000;
  if (!recent) {
    const base = siteUrl();
    const msg = confirmEmail({
      product: p.name,
      target,
      confirmUrl: `${base}/alerta/confirmar?t=${row!.token}`,
      cancelUrl: `${base}/alerta/cancelar?t=${row!.token}`,
    });
    const sent = await sendEmail(await emailConfig(db), { to: email, ...msg });
    if (!sent.ok) return { ok: "Aviso guardado! Em breve você recebe um e-mail para confirmar. Confira também a caixa de spam." };
    await db.from("price_alerts").update({ confirm_sent_at: new Date().toISOString() }).eq("id", row!.id);
  }
  return { ok: "Quase lá! Enviamos um e-mail para confirmar o aviso. Confira também a caixa de spam." };
}

/** Cancela pelo token (link do e-mail). */
export async function cancelAlert(formData: FormData): Promise<void> {
  const token = String(formData.get("t") || "");
  if (!/^[a-f0-9]{36}$/.test(token)) return;
  await adminClient().from("price_alerts").update({ canceled_at: new Date().toISOString() }).eq("token", token).is("canceled_at", null);
  const { redirect } = await import("next/navigation");
  redirect(`/alerta/cancelar?t=${token}&ok=1`);
}
