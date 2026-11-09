import { money } from "./format";

/**
 * Avisos de queda de preço por e-mail: quando avisar e o texto dos e-mails.
 * O envio fica em scripts/alerts.ts (roda depois de cada coleta) e na inscrição (confirmação).
 */

export interface AlertRow {
  id: string;
  product_id: string;
  email: string;
  target_price: number | string | null;
  price_at_signup: number | string | null;
  token: string;
  confirmed_at: string | null;
  last_notified_at: string | null;
  last_notified_price: number | string | null;
  notify_count: number;
}

/** Queda mínima (sem preço-alvo) para valer um e-mail, intervalo entre avisos e limite por inscrição. */
export const DROP_MIN = 0.05;
export const COOLDOWN_DAYS = 3;
export const MAX_NOTIFICATIONS = 12;

const num = (v: number | string | null | undefined) => (v == null || v === "" ? null : Number(v));

export type AlertReason = { kind: "target" | "drop" | "record"; ref: number };

/** Decide se o preço atual merece um aviso para esta inscrição. */
export function shouldNotify(a: AlertRow, price: number, minAll: number | null, now = Date.now()): AlertReason | null {
  if (!a.confirmed_at || a.notify_count >= MAX_NOTIFICATIONS || !(price > 0)) return null;
  const last = num(a.last_notified_price);
  const since = a.last_notified_at ? (now - Date.parse(a.last_notified_at)) / 86_400_000 : Infinity;
  if (since < COOLDOWN_DAYS) return null;
  const target = num(a.target_price);
  const ref = last ?? num(a.price_at_signup);

  if (target != null) {
    if (price > target) return null;
    // atingiu o alvo: avisa uma vez; depois só se cair mais 3% em relação ao último aviso
    if (last == null || price <= last * 0.97) return { kind: "target", ref: target };
    return null;
  }
  if (ref == null) return null;
  const record = minAll != null && price <= minAll + 0.005;
  if (price <= ref * (1 - DROP_MIN)) return { kind: record ? "record" : "drop", ref };
  if (record && price <= ref * 0.98) return { kind: "record", ref };
  return null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function emailLayout(body: string, footer: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F7F8FA;font-family:Arial,Helvetica,sans-serif;color:#17212F">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;border:1px solid #E3E7EE">
<tr><td style="padding:20px 24px 0;font-weight:800;font-size:20px;color:#FF7800">Caça Ofertas</td></tr>
<tr><td style="padding:12px 24px 24px;font-size:16px;line-height:1.5">${body}</td></tr>
</table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#5B6573;margin:14px auto 0">${footer}</p>
</td></tr></table></body></html>`;
}

export const emailButton = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#FF7800;color:#fff;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:999px">${esc(label)}</a>`;

export function confirmEmail(o: { product: string; target: number | null; confirmUrl: string; cancelUrl: string }) {
  const what = o.target != null ? `quando o preço chegar a ${money(o.target)} ou menos` : "quando o preço cair";
  const subject = `Confirme o aviso de preço: ${o.product}`;
  const html = emailLayout(
    `<p style="margin:0 0 12px">Você pediu para ser avisado ${what} no <strong>${esc(o.product)}</strong>.</p>
<p style="margin:0 0 20px">Para ativar o aviso, confirme seu e-mail:</p>
<p style="margin:0 0 20px">${emailButton(o.confirmUrl, "Confirmar aviso")}</p>
<p style="margin:0;font-size:14px;color:#5B6573">Se não foi você, ignore este e-mail: sem a confirmação, nada será enviado.</p>`,
    `Você recebeu este e-mail porque alguém pediu um aviso de preço com este endereço em cacaofertas.com.br. <a href="${esc(o.cancelUrl)}" style="color:#5B6573">Cancelar</a>.`
  );
  const text = `Você pediu para ser avisado ${what} no ${o.product}.\n\nConfirme o aviso: ${o.confirmUrl}\n\nSe não foi você, ignore este e-mail.\nCancelar: ${o.cancelUrl}`;
  return { subject, html, text };
}

export function dropEmail(o: {
  product: string;
  price: number;
  store: string | null;
  reason: AlertReason;
  avg: number | null;
  productUrl: string;
  cancelUrl: string;
}) {
  const head =
    o.reason.kind === "target"
      ? `chegou ao preço que você queria`
      : o.reason.kind === "record"
        ? `está no menor preço que já registramos`
        : `baixou ${Math.round((1 - o.price / o.reason.ref) * 100)}%`;
  const subject = `${o.product} ${head}: ${money(o.price)}`;
  const vs =
    o.reason.kind === "target"
      ? `Seu alvo era ${money(o.reason.ref)}.`
      : `Antes estava em ${money(o.reason.ref)}.`;
  const avg =
    o.avg != null && o.avg > 0
      ? ` A média dos últimos 30 dias é ${money(o.avg)} (${o.price < o.avg ? `${Math.round((1 - o.price / o.avg) * 100)}% abaixo` : "o preço de hoje não está abaixo dela"}).`
      : "";
  const html = emailLayout(
    `<p style="margin:0 0 6px;font-size:14px;color:#5B6573">Aviso de preço</p>
<p style="margin:0 0 12px;font-size:20px;font-weight:800;line-height:1.3">${esc(o.product)} ${esc(head)}</p>
<p style="margin:0 0 4px;font-size:30px;font-weight:800;color:#FF7800">${money(o.price)}</p>
<p style="margin:0 0 16px;color:#3B4656">${o.store ? `${esc(o.store)} · ` : ""}${esc(vs)}${esc(avg)}</p>
<p style="margin:0 0 20px">${emailButton(o.productUrl, "Ver histórico e lojas")}</p>
<p style="margin:0;font-size:13px;color:#5B6573">Preços mudam a qualquer momento: confira o valor final na loja antes de comprar.</p>`,
    `Você recebe este aviso porque pediu em cacaofertas.com.br. Alguns links para as lojas são de afiliado. <a href="${esc(o.cancelUrl)}" style="color:#5B6573">Não quero mais avisos deste produto</a>.`
  );
  const text = `${o.product} ${head}: ${money(o.price)}${o.store ? ` (${o.store})` : ""}.\n${vs}${avg}\n\nHistórico e lojas: ${o.productUrl}\n\nPreços mudam a qualquer momento: confira na loja.\nCancelar este aviso: ${o.cancelUrl}`;
  return { subject, html, text };
}
