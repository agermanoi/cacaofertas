import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Envio de e-mail pelo Resend (https://resend.com). A chave e o remetente ficam no kv
 * (resend_api_key, email_from), salvos pelo admin. Sem chave, nada é enviado e quem chamou
 * deixa o envio pendente para a próxima rodada.
 */

export interface EmailConfig {
  apiKey: string | null;
  from: string;
}

export const DEFAULT_FROM = "Caça Ofertas <avisos@cacaofertas.com.br>";

export async function emailConfig(db: SupabaseClient): Promise<EmailConfig> {
  const { data } = await db.from("kv").select("key,value").in("key", ["resend_api_key", "email_from"]);
  const kv = Object.fromEntries((data || []).map((r) => [r.key, String(r.value || "")]));
  return { apiKey: kv.resend_api_key || process.env.RESEND_API_KEY || null, from: kv.email_from || DEFAULT_FROM };
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** link de descadastro (vira o cabeçalho List-Unsubscribe, que Gmail e Outlook mostram) */
  unsubscribe?: string;
}

export async function sendEmail(cfg: EmailConfig, msg: EmailMessage): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!cfg.apiKey) return { ok: false, error: "sem chave do Resend" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${cfg.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: cfg.from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        headers: msg.unsubscribe
          ? { "List-Unsubscribe": `<${msg.unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : undefined,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok || !json.id) return { ok: false, error: json.message || `HTTP ${res.status}` };
    return { ok: true, id: json.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Testa a chave sem enviar nada (lista os domínios da conta). */
export async function checkResendKey(
  apiKey: string
): Promise<{ ok: boolean; domains: { name: string; status: string }[]; restricted?: boolean; error?: string }> {
  try {
    const res = await fetch("https://api.resend.com/domains", {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: { name: string; status: string }[]; message?: string; name?: string };
    // chave "Sending access": é válida, só não pode listar domínios
    if (json.name === "restricted_api_key") return { ok: true, domains: [], restricted: true };
    if (!res.ok) return { ok: false, domains: [], error: json.message || `HTTP ${res.status}` };
    return { ok: true, domains: (json.data || []).map((d) => ({ name: d.name, status: d.status })) };
  } catch (e) {
    return { ok: false, domains: [], error: e instanceof Error ? e.message : String(e) };
  }
}
