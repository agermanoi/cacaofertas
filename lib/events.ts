import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductOverview } from "./types";

/**
 * Calendário de datas do varejo (11.11, Black Friday, 12.12, Dia do Consumidor…).
 * Tabela `events`, editada em /admin/datas. Usado pelo contador do topo, pelas
 * páginas /datas/[slug] e pelos posts extras nas redes.
 */

export interface EventRow {
  id: string;
  slug: string;
  name: string;
  /** artigo para frases: "o 11.11", "a Black Friday" */
  article: string;
  /** AAAA-MM-DD */
  date: string;
  /** datas fixas (11/11, 12/12…) passam sozinhas para o ano seguinte */
  yearly: boolean;
  intro: string;
  /** palavras que marcam os cupons da data ("11.11", "11/11", "dia dos solteiros") */
  terms: string[];
  countdown: boolean;
  countdown_days: number;
  page: boolean;
  extra_posts: boolean;
  active: boolean;
}

const COLS = "id,slug,name,article,date,yearly,intro,terms,countdown,countdown_days,page,extra_posts,active";

/** Hoje em Brasília (AAAA-MM-DD). */
export function todayBR(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/** Data efetiva: datas anuais que já passaram há mais de 3 dias pulam para o próximo ano. */
export function effectiveDate(e: Pick<EventRow, "date" | "yearly">, today = todayBR()): string {
  let d = e.date;
  if (!e.yearly) return d;
  while (daysBetween(d, today) > 3) d = `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
  return d;
}

export async function getEvents(db: SupabaseClient): Promise<EventRow[]> {
  try {
    const { data, error } = await db.from("events").select(COLS).eq("active", true).order("date");
    if (error) return [];
    const today = todayBR();
    return ((data || []) as EventRow[])
      .map((e) => ({ ...e, date: effectiveDate(e, today), terms: e.terms || [] }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export async function getEventBySlug(db: SupabaseClient, slug: string): Promise<EventRow | null> {
  return (await getEvents(db)).find((e) => e.slug === slug) || null;
}

/** Evento de hoje (ou null). */
export function eventToday(events: EventRow[], today = todayBR()): EventRow | null {
  return events.find((e) => e.date === today) || null;
}

/** Próximo evento com contador dentro da janela de dias (inclui o dia de hoje). */
export function countdownEvent(events: EventRow[], today = todayBR()): { e: EventRow; days: number } | null {
  for (const e of events) {
    if (!e.countdown) continue;
    const days = daysBetween(today, e.date);
    if (days >= 0 && days <= e.countdown_days) return { e, days };
  }
  return null;
}

export function countdownLabel(x: { e: EventRow; days: number }): string {
  const { e, days } = x;
  if (days === 0) return `Hoje é ${e.name}`;
  return `${days === 1 ? "Falta 1 dia" : `Faltam ${days} dias`} para ${e.article} ${e.name}`;
}

/** Datas com página que aparecem no menu (da janela do contador até 1 dia depois). */
export function navEvent(events: EventRow[], today = todayBR()): EventRow | null {
  return (
    events.find((e) => {
      if (!e.page) return false;
      const days = daysBetween(today, e.date);
      return days >= -1 && days <= e.countdown_days;
    }) || null
  );
}

const plain = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** O texto fala da data? (cupom "Cupom 11.11 Mercado Livre", "Esquenta Black Friday"…) */
export function mentionsEvent(e: Pick<EventRow, "terms">, ...texts: (string | null | undefined)[]): boolean {
  const t = plain(texts.filter(Boolean).join(" "));
  return e.terms.some((term) => {
    const k = plain(term).trim();
    if (!k) return false;
    const esc = k.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`).test(t);
  });
}

export interface EventDeal {
  p: ProductOverview;
  /** menor preço no dia do evento */
  price: number;
  /** média dos 30 dias anteriores ao evento */
  avg: number;
  /** queda (positiva) ou alta (negativa) vs a média */
  pct: number;
}

/**
 * Preço do dia do evento contra a média dos 30 dias anteriores, por produto.
 * Antes do evento usa o preço de hoje (para mostrar "o preço para bater").
 */
export async function eventDeals(db: SupabaseClient, e: EventRow, products: ProductOverview[]): Promise<EventDeal[]> {
  if (!products.length) return [];
  const day = e.date <= todayBR() ? e.date : todayBR();
  const from = addDays(e.date <= todayBR() ? e.date : todayBR(), -30);
  const { data } = await db
    .from("product_daily")
    .select("product_id, day, min_price")
    .in(
      "product_id",
      products.map((p) => p.id)
    )
    .gte("day", from)
    .lte("day", day)
    .limit(20000);
  const byProduct = new Map<string, { day: string; min_price: number }[]>();
  for (const r of data || []) {
    const list = byProduct.get(r.product_id) || [];
    list.push({ day: r.day, min_price: Number(r.min_price) });
    byProduct.set(r.product_id, list);
  }
  const out: EventDeal[] = [];
  for (const p of products) {
    const rows = byProduct.get(p.id) || [];
    const onDay = rows.find((r) => r.day === day);
    const before = rows.filter((r) => r.day < day);
    if (!onDay || before.length < 5) continue;
    const avg = before.reduce((s, r) => s + r.min_price, 0) / before.length;
    out.push({ p, price: onDay.min_price, avg, pct: (avg - onDay.min_price) / avg });
  }
  return out.sort((a, b) => b.pct - a.pct);
}

/** Datas pela chave pública (páginas e artes). Sem Supabase configurado, lista vazia. */
export async function getPublicEvents(): Promise<EventRow[]> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return [];
  const { publicClient } = await import("./supabase");
  return getEvents(publicClient());
}
