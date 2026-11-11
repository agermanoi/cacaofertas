import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Canal do Telegram: cada post das redes (produto, cupom, data especial) também vai para o canal,
 * com a arte, a legenda sem hashtags e um botão para a página do produto no site.
 *
 * kv: telegram_bot_token (do @BotFather) e telegram_chat ("@canal" ou id numérico -100…).
 * O bot precisa ser administrador do canal com permissão de publicar.
 */
export interface TelegramConfig {
  token: string | null;
  chat: string | null;
}

export async function telegramConfig(db: SupabaseClient): Promise<TelegramConfig> {
  const { data } = await db.from("kv").select("key,value").in("key", ["telegram_bot_token", "telegram_chat"]);
  const kv = Object.fromEntries((data || []).map((r) => [r.key, String(r.value || "").trim()]));
  return { token: kv.telegram_bot_token || null, chat: kv.telegram_chat || null };
}

async function call<T>(token: string, method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!json.ok) throw new Error(json.description || `HTTP ${res.status}`);
  return json.result as T;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Converte a legenda do Facebook (que tem o link do produto) para o Telegram:
 * tira as hashtags, troca a origem do link (utm) e devolve o link à parte para virar botão.
 */
export function telegramCaption(fbCaption: string): { text: string; link: string | null } {
  let link: string | null = null;
  const lines = fbCaption.split("\n").filter((l) => {
    const m = l.match(/https?:\/\/\S+/);
    if (m && !link) {
      link = m[0].replace("utm_source=facebook", "utm_source=telegram");
      return false;
    }
    // hashtags e o convite para o próprio canal ficam de fora
    return !/^(#\S+\s*)+$/.test(l.trim()) && !/t\.me\//.test(l);
  });
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const html = lines.map((l, i) => (i === 1 ? `<b>${esc(l)}</b>` : esc(l))).join("\n");
  return { text: html.slice(0, 1000), link };
}

export async function telegramSendPhoto(cfg: TelegramConfig, o: { photo: string; caption: string; link?: string | null; button?: string }) {
  if (!cfg.token || !cfg.chat) throw new Error("Telegram não configurado");
  const msg = await call<{ message_id: number }>(cfg.token, "sendPhoto", {
    chat_id: cfg.chat,
    photo: o.photo,
    caption: o.caption,
    parse_mode: "HTML",
    reply_markup: o.link ? { inline_keyboard: [[{ text: o.button || "Ver histórico e lojas", url: o.link }]] } : undefined,
  });
  return msg.message_id;
}

export async function telegramSendText(cfg: TelegramConfig, text: string) {
  if (!cfg.token || !cfg.chat) throw new Error("Telegram não configurado");
  const msg = await call<{ message_id: number }>(cfg.token, "sendMessage", { chat_id: cfg.chat, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
  return msg.message_id;
}
