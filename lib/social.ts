import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductOverview } from "./types";
import { verdictFor, type Verdict } from "./verdict";
import { siteUrl } from "./site";

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
  /** auto = publica sozinho depois de cada coleta; approval = cria na fila e espera o "Publicar" no painel */
  mode: "auto" | "approval";
  /** posts por coleta (a coleta roda 2x por dia) */
  perRun: number;
  instagram: boolean;
  facebook: boolean;
  /** também publica nos Stories do Instagram */
  story: boolean;
  /** dias até o mesmo produto poder voltar (antes disso, só se o preço cair mais 3%) */
  repeatDays: number;
  /** queda mínima vs média de 30 dias, em %, para contar como oferta real */
  minDrop: number;
  /** sem queda real, posta os mais buscados com o menor preço do dia */
  fallback: boolean;
  hashtags: string;
  /** linha extra no fim da legenda */
  footer: string;
}

export const DEFAULT_SOCIAL: SocialConfig = {
  enabled: true,
  mode: "approval",
  perRun: 2,
  instagram: true,
  facebook: true,
  story: false,
  repeatDays: 7,
  minDrop: 7,
  fallback: true,
  hashtags: "#ofertas #promoção #descontos #blackfriday #achadinhos #cacaofertas",
  footer: "Preços mudam rápido: confira no site antes de comprar.",
};

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
    repeatDays: num(r.repeatDays, D.repeatDays, 1, 60),
    minDrop: num(r.minDrop, D.minDrop, 1, 80),
    fallback: bool(r.fallback, D.fallback),
    hashtags: typeof r.hashtags === "string" ? r.hashtags.trim().slice(0, 600) : D.hashtags,
    footer: typeof r.footer === "string" ? r.footer.trim().slice(0, 300) : D.footer,
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
  lines.push(`💰 ${brl(price)}${p.best_store ? ` na ${p.best_store}` : ""}`);
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
  return [...real, ...popular].slice(0, limit);
}

/* ------------------------------------------------------------------- arte */

/** Busca a arte PNG do site, converte para JPEG e guarda no Storage. Devolve a URL pública. */
export async function renderToStorage(db: SupabaseClient, slug: string, format: "feed" | "story"): Promise<string> {
  const src = `${siteUrl()}/social/${encodeURIComponent(slug)}/${format}?t=${Date.now()}`;
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
    .upload(path, jpg, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
  if (error) throw new Error(`Upload da arte: ${error.message}`);
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Cria o post na fila (arte + legendas). */
export async function queuePost(db: SupabaseClient, c: Candidate, cfg: SocialConfig): Promise<number> {
  const feed = await renderToStorage(db, c.p.slug, "feed");
  const story = cfg.story ? await renderToStorage(db, c.p.slug, "story") : null;
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
async function igPublish(acc: MetaAccount, params: Record<string, string>): Promise<string> {
  const { id } = await graphPost(`/${acc.igId}/media`, { ...params, access_token: acc.pageToken });
  for (let i = 0; i < 20; i++) {
    const st = await graphGet(`/${id}`, { fields: "status_code", access_token: acc.pageToken });
    if (st.status_code === "FINISHED") break;
    if (st.status_code === "ERROR" || st.status_code === "EXPIRED") throw new Error(`Instagram recusou a imagem (${st.status_code}).`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  const out = await graphPost(`/${acc.igId}/media_publish`, { creation_id: id, access_token: acc.pageToken });
  return String(out.id);
}

/**
 * Publica um post da fila nas redes ligadas. Erro numa rede não impede a outra;
 * o resultado (ids, link, erro) fica gravado no post.
 */
export async function publishPost(db: SupabaseClient, id: number, cfgIn?: SocialConfig): Promise<{ ok: boolean; error?: string }> {
  const cfg = cfgIn || (await getSocialConfig(db));
  const acc = await getMetaAccount(db);
  if (!acc.pageToken) return { ok: false, error: "Facebook/Instagram não conectados." };

  // trava contra clique duplo / duas execuções
  const { data: post } = await db
    .from("social_posts")
    .update({ status: "publishing", error: null })
    .eq("id", id)
    .in("status", ["queued", "failed"])
    .select("*")
    .maybeSingle();
  if (!post) return { ok: false, error: "Post não está na fila (já publicado ou descartado)." };

  const upd: Record<string, unknown> = {};
  const errors: string[] = [];
  let any = false;

  if (cfg.instagram && acc.igId && post.feed_url) {
    try {
      upd.ig_media_id = await igPublish(acc, { image_url: post.feed_url, caption: post.caption });
      any = true;
      try {
        const m = await graphGet(`/${upd.ig_media_id}`, { fields: "permalink", access_token: acc.pageToken });
        upd.ig_permalink = m.permalink || null;
      } catch {
        /* sem link, tudo bem */
      }
    } catch (e) {
      errors.push(`Instagram: ${(e as Error).message}`);
    }
    if (cfg.story && post.story_url) {
      try {
        upd.ig_story_id = await igPublish(acc, { image_url: post.story_url, media_type: "STORIES" });
        any = true;
      } catch (e) {
        errors.push(`Stories: ${(e as Error).message}`);
      }
    }
  }
  if (cfg.facebook && acc.pageId && post.feed_url) {
    try {
      const out = await graphPost(`/${acc.pageId}/photos`, {
        url: post.feed_url,
        message: post.fb_caption || post.caption,
        access_token: acc.pageToken,
      });
      upd.fb_post_id = String(out.post_id || out.id);
      any = true;
    } catch (e) {
      errors.push(`Facebook: ${(e as Error).message}`);
    }
  }
  if (!any && !errors.length) errors.push("Nenhuma rede ligada nas configurações (Instagram/Facebook).");

  await db
    .from("social_posts")
    .update({
      ...upd,
      status: any ? "published" : "failed",
      error: errors.length ? errors.join(" | ").slice(0, 1000) : null,
      published_at: any ? new Date().toISOString() : null,
    })
    .eq("id", id);
  return { ok: any, error: errors.join(" | ") || undefined };
}
