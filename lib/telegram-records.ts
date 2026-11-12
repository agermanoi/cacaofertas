import type { SupabaseClient } from "@supabase/supabase-js";
import { money } from "./format";
import { siteUrl } from "./site";
import { renderToStorage, brNow } from "./social";
import { telegramConfig, telegramSendPhoto } from "./telegram";
import { todayBR, addDays } from "./events";

/**
 * Alerta de "novo menor preço" no canal do Telegram, sem esperar os horários fixos (8h/20h).
 * Roda junto com o agendador de hora em hora (api/social/tick), das 8h às 22h.
 *
 * Conta como novo recorde quando o preço de hoje fica pelo menos 1% abaixo de tudo o que o site
 * já tinha registrado até anteontem (assim um preço parado no mínimo há semanas não vira alerta).
 * Mesmos filtros de bom senso da newsletter: 7+ dias de histórico e queda de no máximo 30% sobre
 * a média de 30 dias (mais que isso costuma ser anúncio errado ou outra versão do produto).
 * Não repete o produto, a não ser que caia mais 3%. Até 2 alertas por hora.
 */
const KV_SENT = "telegram_records";
const KV_LOCK = "telegram_records_tick";
const PER_HOUR = 2;

/** Também guarda o texto e a arte, para o admin copiar para o canal do WhatsApp. */
export type SentRecord = { price: number; at: string; slug?: string; name?: string; photo?: string; wa?: string };
type Sent = Record<string, SentRecord>;

export async function telegramRecordsTick(db: SupabaseClient, deadline = Date.now() + 25_000): Promise<{ sent: string[]; skipped?: string; errors: string[] }> {
  const out = { sent: [] as string[], errors: [] as string[] };
  const tg = await telegramConfig(db);
  if (!tg.token || !tg.chat) return { ...out, skipped: "Telegram não configurado" };
  const { hour, key } = brNow();
  if (hour < 8 || hour > 22) return { ...out, skipped: "fora do horário (8h–22h)" };

  const { data: kv } = await db.from("kv").select("key,value").in("key", [KV_SENT, KV_LOCK]);
  const get = (k: string) => kv?.find((r) => r.key === k)?.value;
  if (get(KV_LOCK) === key) return { ...out, skipped: "já rodou nesta hora" };
  await db.from("kv").upsert({ key: KV_LOCK, value: key, updated_at: new Date().toISOString() });
  let sent: Sent = {};
  try {
    sent = JSON.parse(String(get(KV_SENT) || "{}"));
  } catch {
    sent = {};
  }

  const { data: rows } = await db
    .from("product_overview")
    .select("id,slug,name,best_price,best_store,avg_30d,min_all,days_tracked,popularity")
    .eq("active", true)
    .not("best_price", "is", null)
    .order("popularity", { ascending: false });
  const cands = (rows || []).filter((p) => {
    const price = Number(p.best_price);
    const avg = Number(p.avg_30d || 0);
    if (!(price > 0) || Number(p.days_tracked || 0) < 7) return false;
    if (p.min_all == null || price > Number(p.min_all) + 0.005) return false;
    if (avg > 0 && price < avg * 0.7) return false;
    const last = sent[p.id];
    return !last || price <= last.price * 0.97;
  });
  if (!cands.length) return out;

  // menor preço até anteontem, para cada candidato
  const cutoff = addDays(todayBR(), -1);
  const { data: hist } = await db
    .from("product_daily")
    .select("product_id,day,min_price")
    .in("product_id", cands.map((p) => p.id))
    .lt("day", cutoff);
  const prev = new Map<string, { price: number; day: string }>();
  for (const h of hist || []) {
    const v = Number(h.min_price);
    const cur = prev.get(h.product_id);
    if (!cur || v < cur.price) prev.set(h.product_id, { price: v, day: String(h.day) });
  }

  const records = cands
    .map((p) => ({ p, before: prev.get(p.id) }))
    .filter((x) => x.before && Number(x.p.best_price) <= x.before.price * 0.99)
    .sort((a, b) => Number(a.p.best_price) / a.before!.price - Number(b.p.best_price) / b.before!.price);

  for (const { p, before } of records.slice(0, PER_HOUR)) {
    if (Date.now() > deadline) break;
    try {
      const price = Number(p.best_price);
      const avg = p.avg_30d != null ? Number(p.avg_30d) : null;
      const [, m, d] = before!.day.split("-");
      const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const lines = [
        "🚨 <b>Novo menor preço!</b>",
        `<b>${esc(p.name)}</b>`,
        "",
        `💰 ${money(price)}${p.best_store ? ` em ${esc(p.best_store)}` : ""}`,
        `📉 Antes, o menor que tínhamos registrado era ${money(before!.price)} (${d}/${m})`,
        avg && avg > price ? `📊 Média dos últimos 30 dias: ${money(avg)} (${Math.round((1 - price / avg) * 100)}% abaixo)` : "",
        "",
        "Preços mudam rápido: confira no site antes de comprar.",
      ].filter((l, i, a) => l !== "" || (a[i - 1] !== "" && i > 0));
      const photo = await renderToStorage(db, p.slug, "feed");
      await telegramSendPhoto(tg, {
        photo,
        caption: lines.join("\n"),
        link: `${siteUrl()}/produto/${p.slug}?utm_source=telegram&utm_medium=social&utm_campaign=recorde`,
      });
      const link = `${siteUrl()}/produto/${p.slug}`;
      const wa = [
        "🚨 *Novo menor preço!*",
        `*${p.name}*`,
        "",
        `💰 ${money(price)}${p.best_store ? ` em ${p.best_store}` : ""}`,
        `📉 Antes, o menor que tínhamos registrado era ${money(before!.price)} (${d}/${m})`,
        avg && avg > price ? `📊 Média dos últimos 30 dias: ${money(avg)}` : "",
        "",
        `🔗 ${link}?utm_source=whatsapp&utm_medium=social&utm_campaign=recorde`,
        "Preços mudam rápido: confira no site antes de comprar.",
      ]
        .filter((l, i, a) => l !== "" || a[i - 1] !== "")
        .join("\n");
      sent[p.id] = { price, at: new Date().toISOString(), slug: p.slug, name: p.name, photo, wa };
      out.sent.push(p.slug);
    } catch (e) {
      out.errors.push(`${p.slug}: ${(e as Error).message}`);
    }
  }
  // limpa registros com mais de 60 dias
  const old = Date.now() - 60 * 86_400_000;
  for (const [id, v] of Object.entries(sent)) if (Date.parse(v.at) < old) delete sent[id];
  await db.from("kv").upsert({ key: KV_SENT, value: JSON.stringify(sent), updated_at: new Date().toISOString() });
  return out;
}

/** Recordes enviados nas últimas horas (para o admin copiar para o WhatsApp). */
export async function recentRecords(db: SupabaseClient, hours = 48): Promise<SentRecord[]> {
  const { data } = await db.from("kv").select("value").eq("key", KV_SENT).maybeSingle();
  let sent: Sent = {};
  try {
    sent = JSON.parse(String(data?.value || "{}"));
  } catch {
    return [];
  }
  const since = Date.now() - hours * 3600_000;
  return Object.values(sent)
    .filter((r) => r.wa && Date.parse(r.at) >= since)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
