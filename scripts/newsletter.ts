/**
 * "Quedas da semana": e-mail semanal com os produtos mais abaixo da própria média de 30 dias.
 * Roda depois de cada coleta (collect.yml) e só envia uma vez por semana: na coleta da noite de
 * quinta (ou na de sexta de manhã, se a de quinta falhar). Também manda confirmações pendentes.
 *
 *   npm run newsletter              (envia se for a hora)
 *   npm run newsletter -- --force   (envia agora, para todos)
 *   npm run newsletter -- --dry     (mostra o que enviaria)
 */
import "dotenv/config";
import { adminClient } from "../lib/supabase";
import { emailConfig, sendEmail } from "../lib/email";
import { newsletterConfirmEmail, pickWeekly, weeklyEmail } from "../lib/newsletter";

const BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cacaofertas.com.br").replace(/\/$/, "");
const DRY = process.argv.includes("--dry");
const FORCE = process.argv.includes("--force");
const db = adminClient();

function due(last: string | null): boolean {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const dow = now.getDay(); // 4 = quinta, 5 = sexta
  const okWindow = (dow === 4 && now.getHours() >= 18) || (dow === 5 && now.getHours() < 18);
  const sinceLast = last ? (Date.now() - Date.parse(last)) / 86_400_000 : Infinity;
  return okWindow && sinceLast > 5;
}

async function main() {
  const cfg = await emailConfig(db);
  if (!cfg.apiKey) {
    console.log("E-mail não configurado: nada enviado.");
    return;
  }

  // confirmações pendentes (inscrições feitas enquanto o e-mail estava fora do ar)
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: pending } = await db
    .from("newsletter_subscribers")
    .select("id,email,token")
    .is("confirmed_at", null)
    .is("canceled_at", null)
    .is("confirm_sent_at", null)
    .gte("created_at", week)
    .limit(200);
  for (const s of pending || []) {
    if (DRY) continue;
    const msg = newsletterConfirmEmail({ confirmUrl: `${BASE}/newsletter/confirmar?t=${s.token}`, cancelUrl: `${BASE}/newsletter/cancelar?t=${s.token}` });
    const r = await sendEmail(cfg, { to: s.email, ...msg });
    if (r.ok) await db.from("newsletter_subscribers").update({ confirm_sent_at: new Date().toISOString() }).eq("id", s.id);
  }

  const { data: lastRow } = await db.from("kv").select("value").eq("key", "newsletter_last_sent").maybeSingle();
  const last = lastRow?.value ? String(lastRow.value) : null;
  if (!FORCE && !DRY && !due(last)) {
    console.log(`Newsletter: não é hora (último envio: ${last || "nunca"}).`);
    return;
  }

  const { data: rows } = await db
    .from("product_overview")
    .select("name,slug,category,best_price,best_store,avg_30d,min_all,days_tracked,image_url")
    .not("best_price", "is", null);
  const picked = pickWeekly(rows || [], 6);
  if (picked.length < 3) {
    console.log(`Newsletter: só ${picked.length} produtos abaixo da média esta semana; envio pulado.`);
    return;
  }
  const dateLabel = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long" });
  const items = picked.map((p) => ({
    name: p.name,
    slug: p.slug,
    price: Number(p.best_price),
    avg: p.avg_30d != null ? Number(p.avg_30d) : null,
    minAll: p.min_all != null ? Number(p.min_all) : null,
    store: p.best_store,
    image: p.image_url,
  }));

  const { data: subs } = await db
    .from("newsletter_subscribers")
    .select("id,email,token,sent_count")
    .not("confirmed_at", "is", null)
    .is("canceled_at", null)
    .limit(5000);
  if (DRY) {
    console.log(`Newsletter (prévia): ${items.map((i) => i.name).join(" | ")} → ${subs?.length ?? 0} inscritos`);
    return;
  }
  let sent = 0;
  for (const s of subs || []) {
    const msg = weeklyEmail({ items, base: BASE, dateLabel, unsubscribeUrl: `${BASE}/newsletter/cancelar?t=${s.token}` });
    const r = await sendEmail(cfg, { to: s.email, ...msg, unsubscribe: `${BASE}/newsletter/sair?t=${s.token}` });
    if (!r.ok) {
      console.log(`Falha num envio: ${r.error}`);
      continue;
    }
    sent++;
    await db.from("newsletter_subscribers").update({ last_sent_at: new Date().toISOString(), sent_count: (s.sent_count || 0) + 1 }).eq("id", s.id);
    await new Promise((res) => setTimeout(res, 250)); // limite do Resend: 5 por segundo
  }
  await db.from("kv").upsert({ key: "newsletter_last_sent", value: new Date().toISOString(), updated_at: new Date().toISOString() });
  console.log(`Newsletter enviada para ${sent} de ${subs?.length ?? 0} inscritos (${items.length} produtos).`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
