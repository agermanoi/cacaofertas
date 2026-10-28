import type { SupabaseClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import { lomadeeBrands, lomadeeCampaigns } from "../lib/collectors/lomadee";
import { http } from "../lib/http";
import { normalizeStore } from "../lib/affiliate";

/**
 * Importa cupons das redes de afiliados para a tabela coupons.
 * Cupons que sumiram da rede são pausados (não apagados), para manter os cliques.
 */

type Row = {
  source: string;
  external_id: string;
  store: string;
  title: string;
  code: string | null;
  description: string | null;
  rules: string | null;
  discount: string | null;
  category: string | null;
  url: string;
  affiliate_url: string | null;
  starts_at: string | null;
  expires_at: string | null;
  highlight: boolean;
  active: boolean;
  updated_at: string;
  meta?: Record<string, unknown> | null;
};

const iso = (v: unknown): string | null => {
  if (!v) return null;
  const s = String(v).trim();
  // "28/11/2026" ou "28/11/2026 23:59"
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  const d = br ? new Date(`${br[3]}-${br[2]}-${br[1]}T${br[4] || "23"}:${br[5] || "59"}:00-03:00`) : new Date(s.length === 10 ? `${s}T23:59:00-03:00` : s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

/** Tenta achar o desconto no texto ("10% OFF", "R$ 50"). */
function discountFrom(...texts: (string | undefined | null)[]): string | null {
  const t = texts.filter(Boolean).join(" ");
  const pct = t.match(/(\d{1,2})\s?%/);
  if (pct) return `${pct[1]}% OFF`;
  const brl = t.match(/R\$\s?(\d{1,5}(?:[.,]\d{2})?)/i);
  if (brl) return `R$ ${brl[1]} OFF`;
  return null;
}

/** Material de divulgação (banner, post, story) e avisos sem desconto não são cupom. */
const CREATIVE = /\b(banner|feed|story|stories|post|carrossel|logo|vitrine|e-?mail ?mkt)\b|\d{2,4}\s?[x×]\s?\d{2,4}/i;
export function isRealCoupon(title: string, description: string | null | undefined, code: string | null | undefined): boolean {
  if (CREATIVE.test(title)) return false;
  if (code) return true;
  const t = `${title} ${description || ""}`;
  return /\d{1,2}\s?%|r\$\s?\d|frete gr[aá]tis|cashback|leve \d|compre \d|\boff\b|desconto|cupom/i.test(t);
}

async function upsert(db: SupabaseClient, source: string, rows: Row[]): Promise<number> {
  const now = new Date().toISOString();
  if (rows.length) {
    // Mantém o link de afiliado já gerado e o destaque/pausa escolhidos à mão
    const { data: existing } = await db
      .from("coupons")
      .select("external_id, affiliate_url, highlight, active")
      .eq("source", source);
    const prev = new Map((existing || []).map((e) => [e.external_id, e]));
    for (const r of rows) {
      const p = prev.get(r.external_id);
      if (p) {
        r.affiliate_url = r.affiliate_url || p.affiliate_url;
        r.highlight = p.highlight || r.highlight;
        r.active = p.active; // se você pausou no painel, continua pausado
      }
    }
    const { error } = await db.from("coupons").upsert(rows, { onConflict: "source,external_id" });
    if (error) throw error;
  }
  // Pausa os que não vieram nesta importação
  const ids = rows.map((r) => r.external_id);
  let q = db.from("coupons").update({ active: false, updated_at: now }).eq("source", source).eq("active", true);
  if (ids.length) q = q.not("external_id", "in", `(${ids.map((i) => `"${i.replace(/"/g, "")}"`).join(",")})`);
  await q;
  return rows.length;
}

export async function importLomadee(db: SupabaseClient): Promise<{ count: number; error?: string }> {
  try {
    const [campaigns, brands] = await Promise.all([lomadeeCampaigns(), lomadeeBrands()]);
    const names = new Map(brands.brands.filter((b) => b.id).map((b) => [b.id!, b.name]));
    const now = new Date().toISOString();
    const { data: existing } = await db.from("coupons").select("external_id, affiliate_url").eq("source", "lomadee");
    const known = new Map((existing || []).map((e) => [e.external_id, e.affiliate_url]));

    const rows: Row[] = [];
    const seenTitles = new Set<string>();
    for (const c of campaigns) {
      if (!c.url) continue;
      const code = c.type.includes("Coupon") && c.code ? c.code : null;
      if (!isRealCoupon(c.name, c.description, code)) continue;
      const dupKey = `${c.organizationId}|${c.name.trim().toLowerCase()}|${code || ""}`;
      if (seenTitles.has(dupKey)) continue;
      seenTitles.add(dupKey);
      const store = normalizeStore(names.get(c.organizationId || "") || c.name.split(/[-–|:]/)[0] || "Loja");
      // O link curto de afiliado é gerado no primeiro clique (/c/[id]) e guardado
      const aff = known.get(c.id) || null;
      rows.push({
        source: "lomadee",
        external_id: c.id,
        store,
        title: c.name.slice(0, 200) || `Oferta ${store}`,
        code: c.type.includes("Coupon") && c.code ? c.code.slice(0, 80) : null,
        description: c.description?.slice(0, 600) || null,
        rules: null,
        discount: discountFrom(c.name, c.description),
        category: c.categories?.[0]?.slice(0, 80) || null,
        url: c.url,
        affiliate_url: aff,
        starts_at: iso(c.startAt),
        expires_at: iso(c.endAt),
        highlight: Boolean(c.isHighlight),
        active: true,
        updated_at: now,
        meta: c.organizationId ? { organizationId: c.organizationId } : null,
      });
    }
    return { count: await upsert(db, "lomadee", rows) };
  } catch (e) {
    return { count: 0, error: (e as Error).message.slice(0, 300) };
  }
}

export async function importAfilio(db: SupabaseClient): Promise<{ count: number; error?: string; sample?: unknown }> {
  const token = process.env.AFILIO_TOKEN;
  const affid = process.env.AFILIO_AFFID;
  const siteid = process.env.AFILIO_SITEID;
  if (!token || !affid || !siteid) return { count: 0, error: "credenciais incompletas" };
  try {
    const params = new URLSearchParams({ token, mode: "dl", siteid, affid, format: "json" });
    const res = await http(`https://v2.afilio.com.br/api/feedproducts.php?${params}`);
    const text = await res.text();
    let items: Record<string, any>[] = [];
    try {
      const j = JSON.parse(text);
      items = Array.isArray(j) ? j : j?.coupons || j?.list || j?.data || Object.values(j || {});
    } catch {
      const $ = cheerio.load(text, { xmlMode: true });
      $("coupon, item, cupom, couponoffer").each((_, el) => {
        const o: Record<string, string> = {};
        $(el)
          .children()
          .each((__, f) => {
            o[(f as any).name] = $(f).text();
          });
        items.push(o);
      });
      if (!items.length) return { count: 0, error: `Resposta inesperada: ${text.slice(0, 200)}` };
    }
    const now = new Date().toISOString();
    const rows: Row[] = items
      .filter((i) => i && (i.url || i.link) && isRealCoupon(String(i.title || i.description || ""), i.description, i.code))
      .map((i) => ({
        source: "afilio",
        external_id: String(i.id_couponoffer || i.id || i.code || i.url).slice(0, 300),
        store: normalizeStore(String(i.program || i.progname || i.advertiser || i.loja || `Afilio ${i.progid || ""}`).trim()),
        title: String(i.title || i.description || "Cupom").slice(0, 200),
        code: i.code ? String(i.code).slice(0, 80) : null,
        description: i.description && i.description !== i.title ? String(i.description).slice(0, 600) : null,
        rules: i.rule ? String(i.rule).slice(0, 1500) : null,
        discount: i.discount ? String(i.discount).slice(0, 40) : discountFrom(i.title, i.description),
        category: null,
        url: String(i.url || i.link),
        affiliate_url: String(i.url || i.link), // links da Afilio já vêm rastreados
        starts_at: iso(i.startdate),
        expires_at: iso(i.enddate),
        highlight: false,
        active: true,
        updated_at: now,
      }));
    return { count: await upsert(db, "afilio", rows), sample: items[0] ? Object.keys(items[0]) : undefined };
  } catch (e) {
    return { count: 0, error: (e as Error).message.slice(0, 300) };
  }
}

export async function importCoupons(db: SupabaseClient) {
  const result: Record<string, unknown> = { at: new Date().toISOString() };
  if (process.env.LOMADEE_API_KEY) result.lomadee = await importLomadee(db);
  if (process.env.AFILIO_TOKEN) result.afilio = await importAfilio(db);
  await db.from("kv").upsert({ key: "coupons_import", value: JSON.stringify(result), updated_at: new Date().toISOString() });
  console.log("Cupons:", JSON.stringify(result));
  return result;
}
