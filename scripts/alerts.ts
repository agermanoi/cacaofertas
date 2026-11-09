/**
 * Avisos de queda de preço por e-mail. Roda depois de cada coleta (collect.yml).
 *  1. envia as confirmações pendentes (inscrições feitas enquanto o e-mail não estava configurado)
 *  2. avisa quem pediu, quando o preço atinge o alvo ou cai pelo menos 5%
 *
 *   npm run alerts            (envia)
 *   npm run alerts -- --dry   (só mostra o que enviaria)
 */
import "dotenv/config";
import { adminClient } from "../lib/supabase";
import { emailConfig, sendEmail } from "../lib/email";
import { confirmEmail, dropEmail, shouldNotify, type AlertRow } from "../lib/alerts";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cacaofertas.com.br").replace(/\/$/, "");
const DRY = process.argv.includes("--dry");
const db = adminClient();

async function main() {
  const cfg = await emailConfig(db);
  if (!DRY) await db.from("price_alerts").delete().lt("canceled_at", new Date(Date.now() - 90 * 86_400_000).toISOString());
  if (!cfg.apiKey && !DRY) {
    const { count } = await db.from("price_alerts").select("id", { count: "exact", head: true }).is("canceled_at", null);
    console.log(`E-mail ainda não configurado (chave do Resend no admin). ${count ?? 0} avisos guardados, nada enviado.`);
    return;
  }

  // 1. confirmações pendentes (até 7 dias depois da inscrição)
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: pending } = await db
    .from("price_alerts")
    .select("id,email,token,target_price,product_id,products(name)")
    .is("confirmed_at", null)
    .is("canceled_at", null)
    .is("confirm_sent_at", null)
    .gte("created_at", week)
    .limit(200);
  let confirmations = 0;
  for (const a of pending || []) {
    const name = (a.products as unknown as { name: string } | null)?.name || "produto";
    const msg = confirmEmail({
      product: name,
      target: a.target_price != null ? Number(a.target_price) : null,
      confirmUrl: `${BASE}/alerta/confirmar?t=${a.token}`,
      cancelUrl: `${BASE}/alerta/cancelar?t=${a.token}`,
    });
    if (DRY) {
      console.log(`[confirmação] ${name}`);
      continue;
    }
    const r = await sendEmail(cfg, { to: a.email, ...msg });
    if (r.ok) {
      confirmations++;
      await db.from("price_alerts").update({ confirm_sent_at: new Date().toISOString() }).eq("id", a.id);
    } else console.log(`Falha na confirmação: ${r.error}`);
  }

  // 2. avisos de preço
  const { data: alerts } = await db
    .from("price_alerts")
    .select("id,product_id,email,target_price,price_at_signup,token,confirmed_at,last_notified_at,last_notified_price,notify_count")
    .not("confirmed_at", "is", null)
    .is("canceled_at", null)
    .limit(5000);
  const ids = [...new Set((alerts || []).map((a) => a.product_id))];
  const { data: products } = ids.length
    ? await db.from("product_overview").select("id,name,slug,best_price,best_store,avg_30d,min_all").in("id", ids)
    : { data: [] };
  const byId = new Map((products || []).map((p) => [p.id, p]));

  let sent = 0;
  for (const a of (alerts || []) as AlertRow[]) {
    const p = byId.get(a.product_id);
    if (!p || p.best_price == null) continue;
    const price = Number(p.best_price);
    const reason = shouldNotify(a, price, p.min_all != null ? Number(p.min_all) : null);
    if (!reason) continue;
    const msg = dropEmail({
      product: p.name,
      price,
      store: p.best_store,
      reason,
      avg: p.avg_30d != null ? Number(p.avg_30d) : null,
      productUrl: `${BASE}/produto/${p.slug}?utm_source=email&utm_medium=alerta`,
      cancelUrl: `${BASE}/alerta/cancelar?t=${a.token}`,
    });
    if (DRY) {
      console.log(`[aviso] ${msg.subject}`);
      continue;
    }
    const r = await sendEmail(cfg, { to: a.email, ...msg, unsubscribe: `${BASE}/alerta/sair?t=${a.token}` });
    if (!r.ok) {
      console.log(`Falha no aviso (${p.slug}): ${r.error}`);
      continue;
    }
    sent++;
    await db
      .from("price_alerts")
      .update({ last_notified_at: new Date().toISOString(), last_notified_price: price, notify_count: a.notify_count + 1 })
      .eq("id", a.id);
  }
  // sem e-mails nos logs (são públicos): só contagens
  console.log(`Confirmações enviadas: ${confirmations}. Avisos de preço enviados: ${sent} (de ${alerts?.length ?? 0} ativos).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
