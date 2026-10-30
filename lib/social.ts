import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductOverview } from "./types";
import { verdictFor, type Verdict } from "./verdict";
import { siteUrl } from "./site";
import { tiktokSendDraft } from "./tiktok";

/**
 * Publicação automática no Instagram e na Página do Facebook (Meta Graph API).
 *
 * Fluxo: escolhe as ofertas → gera a arte (rota /social/[slug]/feed, PNG) → converte para JPEG
 * (o Instagram só aceita JPEG) → envia para o Storage público → cria o post na fila →
 * publica (modo automático) ou espera aprovação no painel.
 *
 * Usado pela coleta (GitHub Actions) e pelo painel (Vercel). Só fetch: nada de Next aqui.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const BUCKET = "brand";

export interface SocialConfig {
  enabled: boolean;
  /** auto = publica sozinho nos horários; approval = cria na fila e espera o "Publicar" no painel */
  mode: "auto" | "approval";
  /** produtos por horário de produto */
  perRun: number;
  instagram: boolean;
  facebook: boolean;
  /** também publica nos Stories do Instagram */
  story: boolean;
  /** manda rascunho para a caixa de entrada do TikTok (arte vertical + legenda) */
  tiktok: boolean;
  /** dias até o mesmo produto poder voltar (antes disso, só se o preço cair mais 3%) */
  repeatDays: number;
  /** queda mínima vs média de 30 dias, em %, para contar como oferta real */
  minDrop: number;
  /** sem queda real, posta os mais buscados com o menor preço do dia */
  fallback: boolean;
  hashtags: string;
  /** linha extra no fim da legenda */
  footer: string;
  /** horários (Brasília) dos posts de produtos */
  productHours: number[];
  /** posts de cupom nos horários em couponHours */
  coupons: boolean;
  couponHours: number[];
  /** desconto mínimo do cupom: % (ou R$ ≥ 3× esse número quando o desconto é em reais) */
  couponMinPct: number;
}

export const DEFAULT_SOCIAL: SocialConfig = {
  enabled: true,
  mode: "approval",
  perRun: 2,
  instagram: true,
  facebook: true,
  story: false,
  tiktok: false,
  repeatDays: 7,
  minDrop: 7,
  fallback: true,
  hashtags: "#ofertas #promoção #descontos #blackfriday #achadinhos #cacaofertas",
  footer: "Preços mudam rápido: confira no site antes de comprar.",
  productHours: [10, 20],
  coupons: true,
  couponHours: [12, 15, 18],
  couponMinPct: 10,
};

/** "10, 20" → [10, 20] (horas válidas, sem repetir, em ordem). */
export function parseHours(v: unknown, d: number[]): number[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[^0-9]+/) : null;
  if (!list) return d;
  const out = [...new Set(list.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n >= 0 && n <= 23))].sort((a, b) => a - b);
  return out.slice(0, 12);
}

export function parseSocial(raw: unknown): SocialConfig {
  let r: Partial<SocialConfig> = {};
  try {
    r = typeof raw === "string" ? JSON.parse(raw) : ((raw as Partial<SocialConfig>) || {});
  } catch {
    r = {};
  }
  const D = DEFAULT_SOCIAL;
  const num = (v: unknown, d: number, min: number, max: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
  };
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  return {
    enabled: bool(r.enabled, D.enabled),
    mode: r.mode === "auto" ? "auto" : r.mode === "approval" ? "approval" : D.mode,
    perRun: num(r.perRun, D.perRun, 1, 5),
    instagram: bool(r.instagram, D.instagram),
    facebook: bool(r.facebook, D.facebook),
    story: bool(r.story, D.story),
    tiktok: bool(r.tiktok, D.tiktok),
    repeatDays: num(r.repeatDays, D.repeatDays, 1, 60),
    minDrop: num(r.minDrop, D.minDrop, 1, 80),
    fallback: bool(r.fallback, D.fallback),
    hashtags: typeof r.hashtags === "string" ? r.hashtags.trim().slice(0, 600) : D.hashtags,
    footer: typeof r.footer === "string" ? r.footer.trim().slice(0, 300) : D.footer,
    productHours: r.productHours === undefined ? D.productHours : parseHours(r.productHours, D.productHours),
    coupons: bool(r.coupons, D.coupons),
    couponHours: r.couponHours === undefined ? D.couponHours : parseHours(r.couponHours, D.couponHours),
    couponMinPct: num(r.couponMinPct, D.couponMinPct, 1, 90),
  };
}

async function kvGet(db: SupabaseClient, keys: string[]): Promise<Record<string, string>> {
  const { data } = await db.from("kv").select("key,value").in("key", keys);
  return Object.fromEntries((data || []).map((r) => [r.key, String(r.value ?? "")]));
}

export async function getSocialConfig(db: SupabaseClient): Promise<SocialConfig> {
  const kv = await kvGet(db, ["social_config"]);
  return parseSocial(kv.social_config);
}

export interface MetaAccount {
  pageId: string;
  pageName: string;
  pageToken: string;
  igId: string;
  igUsername: string;
  status: { ok?: boolean; at?: string; error?: string; permissions?: string[] } | null;
}

export async function getMetaAccount(db: SupabaseClient): Promise<MetaAccount> {
  const kv = await kvGet(db, ["meta_page_id", "meta_page_name", "meta_page_token", "meta_ig_id", "meta_ig_username", "meta_status"]);
  let status = null;
  try {
    status = kv.meta_status ? JSON.parse(kv.meta_status) : null;
  } catch {
    /* ignora */
  }
  return {
    pageId: kv.meta_page_id || "",
    pageName: kv.meta_page_name || "",
    pageToken: kv.meta_page_token || "",
    igId: kv.meta_ig_id || "",
    igUsername: kv.meta_ig_username || "",
    status,
  };
}

/* ------------------------------------------------------------------ legenda */

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function hashtagOf(text: string): string {
  const t = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]/g, "")
    .toLowerCase();
  return t ? `#${t}` : "";
}

/** Título do post conforme o motivo. */
export function headline(v: Verdict): string {
  if (v.kind === "record") return "🔥 Menor preço já visto";
  if (v.kind === "below") return `📉 ${Math.round((v.vsAvg || 0) * 100)}% abaixo da média`;
  return "⭐ Menor preço de hoje";
}

export function buildCaptions(p: ProductOverview, cfg: SocialConfig): { ig: string; fb: string } {
  const v = verdictFor(p);
  const price = Number(p.best_price);
  const list = p.best_list_price != null ? Number(p.best_list_price) : null;
  const host = siteUrl().replace(/^https?:\/\//, "");
  const lines: string[] = [headline(v), p.name, ""];
  lines.push(`💰 ${brl(price)}${p.best_store ? ` ${atStore(p.best_store)}` : ""}`);
  if (list && list > price * 1.02 && v.kind !== "fake") {
    lines.push(`De ${brl(list)} (−${Math.round((1 - price / list) * 100)}%)`);
  }
  if (v.kind === "record" || v.kind === "below") {
    lines.push(`📊 ${v.detail}`);
  } else {
    lines.push("📊 Comparamos as lojas duas vezes por dia e mostramos o histórico de preço.");
  }
  const tags = [cfg.hashtags, hashtagOf(p.category)]
    .join(" ")
    .split(/\s+/)
    .filter((t) => /^#\S+$/.test(t));
  const uniqueTags = [...new Set(tags)].slice(0, 25).join(" ");
  const compose = (link: string) => {
    const parts = [lines.join("\n"), "", link];
    if (cfg.footer) parts.push(cfg.footer);
    if (uniqueTags) parts.push("", uniqueTags);
    return parts.join("\n").trim();
  };
  const url = `${siteUrl()}/produto/${p.slug}`;
  const ig = compose(`🔗 Link na bio → ${host}/hoje`);
  const fb = compose(`🔗 ${url}?utm_source=facebook&utm_medium=social`);
  return { ig: ig.slice(0, 2200), fb: fb.slice(0, 5000) };
}

/* ---------------------------------------------------------------- seleção */

export interface Candidate {
  p: ProductOverview;
  v: Verdict;
  reason: "record" | "below" | "popular";
}

/** Ofertas para postar agora, sem repetir produto dentro de repeatDays (a não ser que caia mais 3%). */
export async function pickCandidates(db: SupabaseClient, cfg: SocialConfig, limit = cfg.perRun): Promise<Candidate[]> {
  const { data: rows } = await db
    .from("product_overview")
    .select("*")
    .eq("active", true)
    .not("best_price", "is", null)
    .not("image_url", "is", null)
    .order("popularity", { ascending: false });
  const products = (rows || []) as ProductOverview[];

  const since = new Date(Date.now() - cfg.repeatDays * 86_400_000).toISOString();
  const { data: recent } = await db
    .from("social_posts")
    .select("product_id,price,status,created_at")
    .gte("created_at", since)
    .in("status", ["queued", "publishing", "published"])
    .order("created_at", { ascending: false });
  const lastPrice = new Map<string, number>();
  for (const r of recent || []) if (r.product_id && !lastPrice.has(r.product_id)) lastPrice.set(r.product_id, Number(r.price));
  const blocked = (p: ProductOverview) => {
    const last = lastPrice.get(p.id);
    return last != null && !(Number(p.best_price) <= last * 0.97);
  };

  const all = products.map((p) => ({ p, v: verdictFor(p) })).filter((c) => !blocked(c.p));
  const real: Candidate[] = all
    .filter((c) => (c.v.kind === "record" || c.v.kind === "below") && (c.v.vsAvg || 0) * 100 >= cfg.minDrop)
    .sort((a, b) => Number(b.v.kind === "record") - Number(a.v.kind === "record") || (b.v.vsAvg || 0) - (a.v.vsAvg || 0))
    .map((c) => ({ ...c, reason: c.v.kind as "record" | "below" }));
  if (real.length >= limit || !cfg.fallback) return real.slice(0, limit);

  const popular: Candidate[] = all
    .filter((c) => !real.some((r) => r.p.id === c.p.id) && ["normal", "learning"].includes(c.v.kind))
    .map((c) => ({ ...c, reason: "popular" as const }));
  // varia a categoria: o mais buscado de cada uma primeiro, depois o resto
  const seen = new Set(real.map((r) => r.p.category));
  const firsts: Candidate[] = [];
  const others: Candidate[] = [];
  for (const c of popular) {
    if (seen.has(c.p.category)) others.push(c);
    else {
      seen.add(c.p.category);
      firsts.push(c);
    }
  }
  return [...real, ...firsts, ...others].slice(0, limit);
}

/* ------------------------------------------------------------------- arte */

/** Busca a arte PNG do site, converte para JPEG e guarda no Storage. Devolve a URL pública. */
export async function renderToStorage(db: SupabaseClient, slug: string, format: "feed" | "story", couponId?: string): Promise<string> {
  const src = couponId
    ? `${siteUrl()}/social/cupom/${couponId}/${format}?t=${Date.now()}`
    : `${siteUrl()}/social/${encodeURIComponent(slug)}/${format}?t=${Date.now()}`;
  const res = await fetch(src, { cache: "no-store" });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.startsWith("image/png")) throw new Error(`Arte ${format} indisponível (${res.status} ${type}) em ${src}`);
  const png = PNG.sync.read(Buffer.from(await res.arrayBuffer()));
  // JPEG não tem transparência: compõe sobre branco
  const { data, width, height } = png;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3] / 255;
    if (a < 1) {
      data[i] = Math.round(data[i] * a + 255 * (1 - a));
      data[i + 1] = Math.round(data[i + 1] * a + 255 * (1 - a));
      data[i + 2] = Math.round(data[i + 2] * a + 255 * (1 - a));
      data[i + 3] = 255;
    }
  }
  const jpg = jpeg.encode({ data, width, height }, 90).data;
  const day = new Date().toISOString().slice(0, 10);
  const path = `social/${day}/${slug}-${format}-${Date.now().toString(36)}.jpg`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, Buffer.from(jpg), { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`Upload da arte: ${error.message}`);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Cria o post na fila (arte + legendas). */
export async function queuePost(db: SupabaseClient, c: Candidate, cfg: SocialConfig): Promise<number> {
  const feed = await renderToStorage(db, c.p.slug, "feed");
  const story = cfg.story || cfg.tiktok ? await renderToStorage(db, c.p.slug, "story") : null;
  const { ig, fb } = buildCaptions(c.p, cfg);
  const { data, error } = await db
    .from("social_posts")
    .insert({
      product_id: c.p.id,
      slug: c.p.slug,
      status: "queued",
      caption: ig,
      fb_caption: fb,
      feed_url: feed,
      story_url: story,
      price: c.p.best_price,
      reason: c.reason,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Fila: ${error.message}`);
  return Number(data.id);
}

/* --------------------------------------------------------------- publicar */

async function graphPost(path: string, params: Record<string, string>) {
  const res = await fetch(`${GRAPH}${path}`, { method: "POST", body: new URLSearchParams(params) });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json.error) throw new Error(json.error?.error_user_msg || json.error?.message || `HTTP ${res.status}`);
  return json;
}
async function graphGet(path: string, params: Record<string, string>) {
  const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`);
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return json;
}

/** Instagram: cria o contêiner, espera processar e publica. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const notReady = (e: unknown) => /pronta|not ready|aguarde|wait a moment|try again/i.test(String((e as Error)?.message || e));

async function igPublish(acc: MetaAccount, params: Record<string, string>): Promise<string> {
  const { id } = await graphPost(`/${acc.igId}/media`, { ...params, access_token: acc.pageToken });
  for (let i = 0; i < 15; i++) {
    const st = await graphGet(`/${id}`, { fields: "status_code", access_token: acc.pageToken }).catch(() => ({}) as any);
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") throw new Error(`Instagram recusou a imagem (${st.status_code}).`);
    await sleep(2000);
  }
  // mesmo com "FINISHED" o Instagram às vezes ainda responde "mídia não está pronta": tenta de novo
  for (let i = 0; ; i++) {
    try {
      const out = await graphPost(`/${acc.igId}/media_publish`, { creation_id: id, access_token: acc.pageToken });
      return String(out.id);
    } catch (e) {
      if (i >= 5 || !notReady(e)) throw e;
      await sleep(3000);
    }
  }
}

/**
 * Publica um post nas redes ligadas. Erro numa rede não impede a outra; o resultado (ids, link, erro)
 * fica gravado no post. Num post já publicado em parte, tenta só as redes que faltaram.
 */
export async function publishPost(db: SupabaseClient, id: number, cfgIn?: SocialConfig): Promise<{ ok: boolean; error?: string }> {
  const cfg = cfgIn || (await getSocialConfig(db));
  const acc = await getMetaAccount(db);
  if (!acc.pageToken) return { ok: false, error: "Facebook/Instagram não conectados." };

  // trava contra clique duplo / duas execuções
  const { data: post } = await db
    .from("social_posts")
    .update({ status: "publishing" })
    .eq("id", id)
    .in("status", ["queued", "failed", "published"])
    .select("*")
    .maybeSingle();
  if (!post) return { ok: false, error: "Post não está na fila (já publicando ou descartado)." };

  const upd: Record<string, unknown> = {};
  const errors: string[] = [];
  const wasPublished = Boolean(post.ig_media_id || post.ig_story_id || post.fb_post_id);

  const instagram = async () => {
    if (!cfg.instagram || !acc.igId || !post.feed_url) return;
    if (!post.ig_media_id) {
      try {
        upd.ig_media_id = await igPublish(acc, { image_url: post.feed_url, caption: post.caption });
        try {
          const m = await graphGet(`/${upd.ig_media_id}`, { fields: "permalink", access_token: acc.pageToken });
          upd.ig_permalink = m.permalink || null;
        } catch {
          /* sem link, tudo bem */
        }
      } catch (e) {
        errors.push(`Instagram: ${(e as Error).message}`);
      }
    }
    if (cfg.story && post.story_url && !post.ig_story_id) {
      try {
        upd.ig_story_id = await igPublish(acc, { image_url: post.story_url, media_type: "STORIES" });
      } catch (e) {
        errors.push(`Stories: ${(e as Error).message}`);
      }
    }
  };
  const facebook = async () => {
    if (!cfg.facebook || !acc.pageId || !post.feed_url || post.fb_post_id) return;
    try {
      const out = await graphPost(`/${acc.pageId}/photos`, {
        url: post.feed_url,
        message: post.fb_caption || post.caption,
        access_token: acc.pageToken,
      });
      upd.fb_post_id = String(out.post_id || out.id);
    } catch (e) {
      errors.push(`Facebook: ${(e as Error).message}`);
    }
  };
  const tiktok = async () => {
    if (!cfg.tiktok || !post.story_url || post.tiktok_publish_id) return;
    try {
      const lines = String(post.caption).split("\n");
      const title = (post.kind === "coupon" ? lines[0] : lines[1] || lines[0]).replace(/^[^\p{L}\p{N}]+/u, "").trim();
      upd.tiktok_publish_id = await tiktokSendDraft(db, {
        imageUrl: post.story_url,
        title,
        description: String(post.caption).replace("Link na bio →", "Link na bio:"),
      });
    } catch (e) {
      errors.push(`TikTok: ${(e as Error).message}`);
    }
  };
  // as redes ao mesmo tempo (cabe no limite de tempo da função)
  await Promise.all([instagram(), facebook(), tiktok()]);
  const any = wasPublished || Boolean(upd.ig_media_id || upd.ig_story_id || upd.fb_post_id || upd.tiktok_publish_id);
  if (!any && !errors.length) errors.push("Nenhuma rede ligada nas configurações (Instagram, Facebook ou TikTok).");

  await db
    .from("social_posts")
    .update({
      ...upd,
      status: any ? "published" : "failed",
      error: errors.length ? errors.join(" | ").slice(0, 1000) : null,
      published_at: any ? post.published_at || new Date().toISOString() : null,
    })
    .eq("id", id);
  return { ok: any, error: errors.join(" | ") || undefined };
}

/** "na Amazon", "no Mercado Livre", "nas Casas Bahia". */
export function atStore(store: string): string {
  const s = store.trim();
  if (/^casas\b/i.test(s)) return `nas ${s}`;
  if (/^(mercado|carrefour|extra|ponto|pão de açúcar|walmart|submarino|shoptime|kabum)/i.test(s)) return `no ${s}`;
  return `na ${s}`;
}

/* ---------------------------------------------------------------- cupons */

export interface CouponRow {
  id: string;
  store: string;
  title: string;
  code: string | null;
  discount: string | null;
  expires_at: string | null;
  highlight: boolean;
}

/** "26% OFF" → { pct: 26 }; "R$ 50 OFF" → { brl: 50 }. */
export function parseDiscount(d: string | null): { pct?: number; brl?: number } {
  if (!d) return {};
  const pct = d.match(/(\d{1,2})\s*%/);
  if (pct) return { pct: Number(pct[1]) };
  const brl = d.match(/R\$\s*([\d.]+)(?:,\d+)?/i);
  if (brl) return { brl: Number(brl[1].replace(/\./g, "")) };
  return {};
}

/** Lojas com nome de verdade (a importação às vezes traz o título no lugar da loja). */
function realStore(store: string): boolean {
  return Boolean(store.trim()) && !/\b(off|desconto|frete|cupom|compra|pix|exclusivo|aqui)\b/i.test(store);
}

/** Validade em texto: "Válido até 31/10" (horário de Brasília). */
export function validity(expires: string | null): string {
  if (!expires) return "Por tempo limitado";
  const d = new Date(expires);
  const fmt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(d);
  const today = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" }).format(new Date());
  return fmt === today ? "Válido só hoje" : `Válido até ${fmt}`;
}

/**
 * Cupons para postar: com código, ainda valendo por pelo menos 6 h, desconto mínimo,
 * sem repetir o cupom em 14 dias nem a loja em 3 dias. Destaques do painel primeiro,
 * depois o maior desconto.
 */
export async function pickCoupons(db: SupabaseClient, cfg: SocialConfig, limit = 1): Promise<CouponRow[]> {
  const soon = new Date(Date.now() + 6 * 3600_000).toISOString();
  const { data } = await db
    .from("coupons")
    .select("id,store,title,code,discount,expires_at,highlight")
    .eq("active", true)
    .not("code", "is", null)
    .or(`expires_at.is.null,expires_at.gt.${soon}`)
    .limit(1000);
  const { data: recent } = await db
    .from("social_posts")
    .select("coupon_id,slug,created_at")
    .eq("kind", "coupon")
    .gte("created_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
    .in("status", ["queued", "publishing", "published"]);
  const usedCoupons = new Set((recent || []).map((r) => r.coupon_id));
  const storeCut = Date.now() - 3 * 86_400_000;
  const usedStores = new Set((recent || []).filter((r) => new Date(r.created_at).getTime() > storeCut).map((r) => r.slug));

  const score = (c: CouponRow) => {
    const d = parseDiscount(c.discount);
    const value = d.pct ?? (d.brl ? d.brl / 3 : 0);
    return (c.highlight ? 1000 : 0) + value;
  };
  const ok = ((data || []) as CouponRow[]).filter((c) => {
    if (!c.code || !realStore(c.store) || usedCoupons.has(c.id) || usedStores.has(couponSlug(c))) return false;
    if (c.highlight) return true;
    const d = parseDiscount(c.discount);
    return (d.pct ?? 0) >= cfg.couponMinPct || (d.brl ?? 0) >= cfg.couponMinPct * 3;
  });
  ok.sort((a, b) => score(b) - score(a));
  const out: CouponRow[] = [];
  for (const c of ok) {
    if (out.some((o) => couponSlug(o) === couponSlug(c))) continue;
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/** Identificador da loja no histórico (para não repetir a loja em seguida). */
export function couponSlug(c: { store: string }): string {
  return `cupom-${c.store
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}

export function couponCaptions(c: CouponRow, cfg: SocialConfig): { ig: string; fb: string } {
  const host = siteUrl().replace(/^https?:\/\//, "");
  const title = c.title.replace(/\s+/g, " ").trim();
  const lines = [
    `🎟️ Cupom ${c.store}${c.discount ? `: ${c.discount}` : ""}`,
    title,
    "",
    `👉 Código: ${c.code}`,
    `⏰ ${validity(c.expires_at)}`,
  ];
  const tags = [...new Set(`${cfg.hashtags} #cupom #cupomdedesconto ${hashtagOf(c.store)}`.split(/\s+/).filter((t) => /^#\S+$/.test(t)))]
    .slice(0, 25)
    .join(" ");
  const compose = (link: string) => {
    const parts = [lines.join("\n"), "", link, "Confira as regras na loja: alguns cupons valem só para a primeira compra ou produtos selecionados."];
    if (tags) parts.push("", tags);
    return parts.join("\n").trim();
  };
  return {
    ig: compose(`🔗 Todos os cupons no link da bio → ${host}/cupons`).slice(0, 2200),
    fb: compose(`🔗 Ir para a loja: ${siteUrl()}/c/${c.id}`).slice(0, 5000),
  };
}

export async function queueCoupon(db: SupabaseClient, c: CouponRow, cfg: SocialConfig): Promise<number> {
  const slug = couponSlug(c);
  const feed = await renderToStorage(db, slug, "feed", c.id);
  const story = cfg.story || cfg.tiktok ? await renderToStorage(db, slug, "story", c.id) : null;
  const { ig, fb } = couponCaptions(c, cfg);
  const { data, error } = await db
    .from("social_posts")
    .insert({ kind: "coupon", coupon_id: c.id, slug, status: "queued", caption: ig, fb_caption: fb, feed_url: feed, story_url: story, reason: "coupon" })
    .select("id")
    .single();
  if (error) throw new Error(`Fila: ${error.message}`);
  return Number(data.id);
}

/* ------------------------------------------------------------- agendador */

/** Hora e dia em Brasília. */
export function brNow(d = new Date()): { hour: number; key: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  return { hour: Number(parts.hour), key: `${parts.year}-${parts.month}-${parts.day}T${parts.hour}` };
}

export interface TickResult {
  hour: number;
  skipped?: string;
  queued: string[];
  published: string[];
  errors: string[];
}

/**
 * Chamado de hora em hora (pg_cron no Supabase). Nos horários de produto, posta as ofertas;
 * nos de cupom, um cupom. Cada hora roda uma vez só, mesmo se chamado de novo.
 * deadlineMs: para de começar posts novos depois desse tempo (limite da função na Vercel).
 */
export async function runTick(db: SupabaseClient, opts: { force?: "product" | "coupon"; deadlineMs?: number } = {}): Promise<TickResult> {
  const start = Date.now();
  const deadline = opts.deadlineMs ?? 40_000;
  const cfg = await getSocialConfig(db);
  const { hour, key } = brNow();
  const res: TickResult = { hour, queued: [], published: [], errors: [] };

  const doProducts = opts.force ? opts.force === "product" : cfg.productHours.includes(hour);
  const doCoupons = opts.force ? opts.force === "coupon" : cfg.coupons && cfg.couponHours.includes(hour);
  if (!opts.force && !cfg.enabled) return { ...res, skipped: "desligado" };
  if (!doProducts && !doCoupons) return { ...res, skipped: "fora do horário" };

  if (!opts.force) {
    // trava da hora: só a primeira chamada passa
    const { data: last } = await db.from("kv").select("value").eq("key", "social_tick").maybeSingle();
    if (last?.value === key) return { ...res, skipped: "já rodou nesta hora" };
    await db.from("kv").upsert({ key: "social_tick", value: key, updated_at: new Date().toISOString() });
  }
  const acc = await getMetaAccount(db);
  if (!acc.pageToken) return { ...res, errors: ["Facebook/Instagram não conectados."] };

  const jobs: { label: string; make: () => Promise<number> }[] = [];
  if (doProducts) for (const c of await pickCandidates(db, cfg)) jobs.push({ label: c.p.slug, make: () => queuePost(db, c, cfg) });
  if (doCoupons) for (const c of await pickCoupons(db, cfg, 1)) jobs.push({ label: `${couponSlug(c)} (${c.code})`, make: () => queueCoupon(db, c, cfg) });

  for (const j of jobs) {
    if (Date.now() - start > deadline) {
      res.errors.push(`${j.label}: ficou para o próximo horário (tempo esgotado)`);
      continue;
    }
    try {
      const id = await j.make();
      res.queued.push(j.label);
      if (cfg.mode === "auto") {
        const r = await publishPost(db, id, cfg);
        if (r.ok) res.published.push(j.label);
        if (r.error) res.errors.push(`${j.label}: ${r.error}`);
      }
    } catch (e) {
      res.errors.push(`${j.label}: ${(e as Error).message}`);
    }
  }
  await db
    .from("kv")
    .upsert({ key: "social_last_run", value: JSON.stringify({ at: new Date().toISOString(), mode: cfg.mode, ...res }), updated_at: new Date().toISOString() });
  return res;
}

/* -------------------------------------------------------------- métricas */

export interface SocialStats {
  igFollowers: number | null;
  igMedia: number | null;
  fbFollowers: number | null;
  recent: { id: string; caption: string; likes: number; comments: number; permalink: string; at: string }[];
  error?: string;
}

/** Seguidores e curtidas/comentários dos últimos posts (permissões que o app já tem). */
export async function getSocialStats(acc: MetaAccount): Promise<SocialStats> {
  const out: SocialStats = { igFollowers: null, igMedia: null, fbFollowers: null, recent: [] };
  if (!acc.pageToken) return { ...out, error: "não conectado" };
  const t = acc.pageToken;
  const get = (path: string, params: Record<string, string>) =>
    Promise.race([graphGet(path, { ...params, access_token: t }), sleep(6000).then(() => Promise.reject(new Error("tempo esgotado")))]);
  const [ig, fb, media] = await Promise.allSettled([
    acc.igId ? get(`/${acc.igId}`, { fields: "followers_count,media_count" }) : Promise.reject(new Error("sem Instagram")),
    get(`/${acc.pageId}`, { fields: "followers_count,fan_count" }),
    acc.igId
      ? get(`/${acc.igId}/media`, { fields: "id,caption,like_count,comments_count,permalink,timestamp", limit: "12" })
      : Promise.reject(new Error("sem Instagram")),
  ]);
  if (ig.status === "fulfilled") {
    out.igFollowers = ig.value.followers_count ?? null;
    out.igMedia = ig.value.media_count ?? null;
  }
  if (fb.status === "fulfilled") out.fbFollowers = fb.value.followers_count ?? fb.value.fan_count ?? null;
  if (media.status === "fulfilled") {
    out.recent = (media.value.data || []).map((m: any) => ({
      id: String(m.id),
      caption: String(m.caption || "").split("\n").slice(0, 2).join(" · ").slice(0, 90),
      likes: Number(m.like_count || 0),
      comments: Number(m.comments_count || 0),
      permalink: String(m.permalink || ""),
      at: String(m.timestamp || ""),
    }));
  }
  const errs = [ig, fb, media].filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason?.message);
  if (errs.length === 3) out.error = errs[0];
  return out;
}
