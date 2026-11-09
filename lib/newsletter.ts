import { money } from "./format";
import { emailButton, emailLayout } from "./alerts";

/**
 * E-mail semanal "Quedas da semana": os produtos mais abaixo da média, com o veredito do histórico.
 * (modelo; o envio para uma lista ainda não está ligado)
 */

export interface NewsletterItem {
  name: string;
  slug: string;
  price: number;
  avg: number | null;
  minAll: number | null;
  store: string | null;
  image: string | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function badge(i: NewsletterItem): { text: string; bg: string; fg: string } {
  if (i.minAll != null && i.price <= i.minAll + 0.005) return { text: "MENOR PREÇO JÁ VISTO", bg: "#146C2E", fg: "#fff" };
  if (i.avg && i.price < i.avg * 0.99) return { text: `${Math.round((1 - i.price / i.avg) * 100)}% ABAIXO DA MÉDIA`, bg: "#FF7800", fg: "#fff" };
  return { text: "NA MÉDIA", bg: "#E3E7EE", fg: "#17212F" };
}

export function weeklyEmail(o: { items: NewsletterItem[]; base: string; dateLabel: string; unsubscribeUrl: string }) {
  const utm = "utm_source=email&utm_medium=newsletter";
  const cards = o.items
    .map((i) => {
      const b = badge(i);
      const url = `${o.base}/produto/${i.slug}?${utm}`;
      return `<tr><td style="padding:0 0 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #E3E7EE;border-radius:14px;background:#fff">
<tr>
<td width="112" style="padding:14px 0 14px 14px;vertical-align:middle">${
        i.image
          ? `<a href="${esc(url)}"><img src="${esc(i.image)}" width="98" height="98" alt="" style="display:block;width:98px;height:98px;object-fit:contain;border-radius:10px;background:#fff"></a>`
          : ""
      }</td>
<td style="padding:14px 16px;vertical-align:middle">
<span style="display:inline-block;font-size:11px;font-weight:800;letter-spacing:.5px;background:${b.bg};color:${b.fg};padding:4px 8px;border-radius:999px">${b.text}</span>
<p style="margin:8px 0 4px;font-size:16px;font-weight:800;line-height:1.3"><a href="${esc(url)}" style="color:#17212F;text-decoration:none">${esc(i.name)}</a></p>
<p style="margin:0;font-size:22px;font-weight:800;color:#FF7800">${money(i.price)}</p>
<p style="margin:2px 0 0;font-size:13px;color:#5B6573">${i.store ? `${esc(i.store)} · ` : ""}${i.avg ? `média de 30 dias ${money(i.avg)}` : ""}</p>
</td></tr></table></td></tr>`;
    })
    .join("");
  const subject = `Quedas da semana: ${o.items[0]?.name ?? "ofertas"} e mais ${Math.max(o.items.length - 1, 0)}`;
  const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F7F8FA;font-family:Arial,Helvetica,sans-serif;color:#17212F">
<div style="display:none;max-height:0;overflow:hidden">Os produtos que mais caíram em relação à média dos últimos 30 dias.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
<tr><td style="padding:0 0 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-weight:900;font-size:24px;color:#FF7800">Caça Ofertas</td>
<td align="right" style="font-size:13px;color:#5B6573">${esc(o.dateLabel)}</td></tr></table>
</td></tr>
<tr><td style="background:#17212F;border-radius:16px;padding:22px 22px 20px;color:#fff">
<p style="margin:0 0 6px;font-size:13px;letter-spacing:1px;color:#F7A535;font-weight:800">QUEDAS DA SEMANA</p>
<p style="margin:0 0 8px;font-size:22px;font-weight:800;line-height:1.25">O que realmente baixou de preço</p>
<p style="margin:0;font-size:15px;line-height:1.5;color:#D5DAE2">Selecionamos pelo histórico, não pelo “de/por” das lojas: cada produto abaixo está mais barato que a própria média dos últimos 30 dias.</p>
</td></tr>
<tr><td style="height:16px"></td></tr>
${cards}
<tr><td align="center" style="padding:6px 0 18px">
<a href="${esc(o.base)}/?${utm}" style="display:inline-block;background:#FF7800;color:#fff;text-decoration:none;font-weight:800;padding:13px 26px;border-radius:999px">Ver todas as ofertas</a>
</td></tr>
<tr><td style="font-size:12px;line-height:1.6;color:#5B6573;text-align:center">
Preços da última leitura do Caça Ofertas e sujeitos a mudança: confira o valor final na loja antes de comprar.<br>
Alguns links são de afiliado: se você comprar por eles, a loja nos paga uma comissão e o preço para você não muda.<br>
<a href="${esc(o.unsubscribeUrl)}" style="color:#5B6573">Não quero mais receber estes e-mails</a>
</td></tr>
</table></td></tr></table></body></html>`;
  const text =
    `Quedas da semana — Caça Ofertas (${o.dateLabel})\n\n` +
    o.items
      .map((i) => `• ${i.name}: ${money(i.price)}${i.store ? ` (${i.store})` : ""}${i.avg ? `, média ${money(i.avg)}` : ""}\n  ${o.base}/produto/${i.slug}?${utm}`)
      .join("\n") +
    `\n\nPreços sujeitos a mudança. Links de afiliado.\nCancelar: ${o.unsubscribeUrl}`;
  return { subject, html, text };
}

/** E-mail de confirmação da inscrição na newsletter. */
export function newsletterConfirmEmail(o: { confirmUrl: string; cancelUrl: string }) {
  const subject = "Confirme sua inscrição nas Quedas da semana";
  const html = emailLayout(
    `<p style="margin:0 0 12px">Você pediu para receber as <strong>Quedas da semana</strong> do Caça Ofertas: toda quinta à noite, os produtos que realmente baixaram de preço, escolhidos pelo histórico.</p>
<p style="margin:0 0 20px">${emailButton(o.confirmUrl, "Confirmar inscrição")}</p>
<p style="margin:0;font-size:14px;color:#5B6573">Se não foi você, ignore este e-mail: sem a confirmação, nada será enviado.</p>`,
    `Você recebeu este e-mail porque alguém usou este endereço em cacaofertas.com.br. <a href="${esc(o.cancelUrl)}" style="color:#5B6573">Cancelar</a>.`
  );
  const text = `Confirme sua inscrição nas Quedas da semana do Caça Ofertas: ${o.confirmUrl}\n\nSe não foi você, ignore este e-mail.`;
  return { subject, html, text };
}

/** Escolhe os produtos da semana: mais abaixo da própria média, no máximo 2 por categoria. */
export function pickWeekly<
  T extends { best_price: number | string | null; avg_30d: number | string | null; min_all: number | string | null; days_tracked: number | string | null; category: string },
>(rows: T[], n = 6): T[] {
  const ok = rows
    .map((r) => ({ r, price: Number(r.best_price), avg: Number(r.avg_30d), min: r.min_all == null ? null : Number(r.min_all) }))
    .filter((x) => x.price > 0 && x.avg > 0 && Number(x.r.days_tracked || 0) >= 7)
    .filter((x) => x.price <= x.avg * 0.97) // pelo menos 3% abaixo da média
    .filter((x) => x.min == null || x.min >= x.price * 0.7) // mínimo histórico muito fora do padrão = dado suspeito
    .sort((a, b) => a.price / a.avg - b.price / b.avg);
  const per = new Map<string, number>();
  const out: T[] = [];
  for (const x of ok) {
    const c = per.get(x.r.category) || 0;
    if (c >= 2) continue;
    per.set(x.r.category, c + 1);
    out.push(x.r);
    if (out.length >= n) break;
  }
  return out;
}
