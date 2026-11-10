import type { SupabaseClient } from "@supabase/supabase-js";
import { siteUrl } from "./site";

/**
 * TikTok (Content Posting API). Por padrão manda cada post como RASCUNHO para a caixa de
 * entrada do TikTok (escopo video.upload): você abre o app, escolhe a música e publica.
 * Com a postagem direta ligada (escopo video.publish, precisa de aprovação do TikTok),
 * o admin tem a tela "Publicar no TikTok", que posta direto com a legenda.
 *
 * Chaves na tabela kv (gravadas pelo painel em /admin/tiktok):
 *   tiktok_client_key, tiktok_client_secret       app em developers.tiktok.com
 *   tiktok_access_token, tiktok_access_expires     token de 2 h (renovado sozinho)
 *   tiktok_refresh_token                           válido por 180 dias; muda a cada renovação (sempre gravado)
 *   tiktok_open_id, tiktok_user                    conta conectada
 *   tiktok_verify                                  {"arquivo.txt": "conteúdo"} da verificação de URL
 *
 * As imagens precisam vir de uma URL verificada no app: servimos as artes do Storage
 * por https://SITE/tiktok/m/... (rota app/tiktok/[...path]).
 */

const API = "https://open.tiktokapis.com";
export const TIKTOK_SCOPES = "user.info.basic,video.upload";
export const TIKTOK_STATE_COOKIE = "tiktok_oauth_state";

async function kvGet(db: SupabaseClient, keys: string[]): Promise<Record<string, string>> {
  const { data } = await db.from("kv").select("key,value").in("key", keys);
  return Object.fromEntries((data || []).map((r) => [r.key, String(r.value ?? "")]));
}
async function kvSet(db: SupabaseClient, values: Record<string, string>) {
  const now = new Date().toISOString();
  await db.from("kv").upsert(Object.entries(values).map(([key, value]) => ({ key, value, updated_at: now })));
}

export function tiktokRedirectUri(): string {
  return `${siteUrl()}/admin/tiktok`;
}

/** Prefixo de URL a verificar no app do TikTok (as artes saem daqui). */
export function tiktokUrlPrefix(): string {
  return `${siteUrl()}/tiktok/`;
}

export interface TiktokStatus {
  configured: boolean;
  connected: boolean;
  user?: string;
  scopes?: string;
  refreshExpires?: string;
  verifyFiles: string[];
}

export async function tiktokStatus(db: SupabaseClient): Promise<TiktokStatus> {
  const kv = await kvGet(db, [
    "tiktok_client_key",
    "tiktok_client_secret",
    "tiktok_refresh_token",
    "tiktok_user",
    "tiktok_scopes",
    "tiktok_refresh_expires",
    "tiktok_verify",
  ]);
  let verifyFiles: string[] = [];
  try {
    verifyFiles = Object.keys(JSON.parse(kv.tiktok_verify || "{}"));
  } catch {
    verifyFiles = [];
  }
  return {
    configured: Boolean(kv.tiktok_client_key && kv.tiktok_client_secret),
    connected: Boolean(kv.tiktok_refresh_token),
    user: kv.tiktok_user || undefined,
    scopes: kv.tiktok_scopes || undefined,
    refreshExpires: kv.tiktok_refresh_expires || undefined,
    verifyFiles,
  };
}

/** Postagem direta (Direct Post, escopo video.publish) ligada no admin. */
export async function tiktokDirectEnabled(db: SupabaseClient): Promise<boolean> {
  const kv = await kvGet(db, ["tiktok_direct_post"]);
  return kv.tiktok_direct_post === "1";
}

export async function tiktokSetDirect(db: SupabaseClient, on: boolean) {
  await kvSet(db, { tiktok_direct_post: on ? "1" : "0" });
}

export async function tiktokAuthorizeUrl(db: SupabaseClient, state: string): Promise<string | null> {
  const kv = await kvGet(db, ["tiktok_client_key", "tiktok_direct_post"]);
  if (!kv.tiktok_client_key) return null;
  const p = new URLSearchParams({
    client_key: kv.tiktok_client_key,
    scope: kv.tiktok_direct_post === "1" ? `${TIKTOK_SCOPES},video.publish` : TIKTOK_SCOPES,
    response_type: "code",
    redirect_uri: tiktokRedirectUri(),
    state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${p}`;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  open_id?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body: new URLSearchParams(params),
  });
  const json = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(json.error_description || json.error || `HTTP ${res.status}`);
  }
  return json;
}

async function saveTokens(db: SupabaseClient, t: TokenResponse) {
  const now = Date.now();
  const values: Record<string, string> = {
    tiktok_access_token: t.access_token!,
    // validade informada pelo TikTok (2 h a partir de 01/12/2026); sem ela, assume 2 h
    tiktok_access_expires: new Date(now + (t.expires_in || 7200) * 1000).toISOString(),
  };
  if (t.refresh_token) values.tiktok_refresh_token = t.refresh_token;
  if (t.refresh_expires_in) values.tiktok_refresh_expires = new Date(now + t.refresh_expires_in * 1000).toISOString();
  if (t.open_id) values.tiktok_open_id = t.open_id;
  if (t.scope) values.tiktok_scopes = t.scope;
  await kvSet(db, values);
}

/** Troca o código da volta do login pelo token e grava a conta conectada. */
export async function tiktokExchangeCode(db: SupabaseClient, code: string): Promise<{ ok: true; user: string } | { ok: false; error: string }> {
  const kv = await kvGet(db, ["tiktok_client_key", "tiktok_client_secret"]);
  try {
    const t = await tokenRequest({
      client_key: kv.tiktok_client_key,
      client_secret: kv.tiktok_client_secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: tiktokRedirectUri(),
    });
    await saveTokens(db, t);
    let user = "conta conectada";
    try {
      const res = await fetch(`${API}/v2/user/info/?fields=open_id,display_name`, {
        headers: { authorization: `Bearer ${t.access_token}` },
      });
      const json = (await res.json()) as { data?: { user?: { display_name?: string } } };
      user = json.data?.user?.display_name || user;
    } catch {
      /* sem o nome, tudo bem */
    }
    await kvSet(db, { tiktok_user: user });
    return { ok: true, user };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function tiktokDisconnect(db: SupabaseClient) {
  await db
    .from("kv")
    .delete()
    .in("key", ["tiktok_access_token", "tiktok_access_expires", "tiktok_refresh_token", "tiktok_refresh_expires", "tiktok_open_id", "tiktok_user", "tiktok_scopes"]);
}

/** Token válido (renova quando falta menos de 10 minutos). */
/**
 * Token válido. Regras do TikTok a partir de 01/12/2026: o access token dura 2 h e o refresh token
 * 180 dias, e cada renovação devolve um refresh token NOVO e invalida o anterior. Por isso:
 * renova quando faltam menos de 10 min (pela validade que o próprio TikTok informa), grava sempre o
 * refresh token novo e, se duas renovações acontecerem ao mesmo tempo, a que perder relê o banco e
 * usa o token que a outra gravou.
 */
async function accessToken(db: SupabaseClient): Promise<string> {
  const keys = ["tiktok_client_key", "tiktok_client_secret", "tiktok_access_token", "tiktok_access_expires", "tiktok_refresh_token"];
  const kv = await kvGet(db, keys);
  if (!kv.tiktok_refresh_token) throw new Error("TikTok não conectado.");
  if (kv.tiktok_access_token && new Date(kv.tiktok_access_expires).getTime() - Date.now() > 10 * 60_000) return kv.tiktok_access_token;
  try {
    const t = await tokenRequest({
      client_key: kv.tiktok_client_key,
      client_secret: kv.tiktok_client_secret,
      grant_type: "refresh_token",
      refresh_token: kv.tiktok_refresh_token,
    });
    await saveTokens(db, t);
    return t.access_token!;
  } catch (e) {
    // outra execução pode ter renovado primeiro (o refresh token antigo deixa de valer)
    const again = await kvGet(db, keys);
    if (
      again.tiktok_refresh_token !== kv.tiktok_refresh_token &&
      again.tiktok_access_token &&
      new Date(again.tiktok_access_expires).getTime() > Date.now()
    ) {
      return again.tiktok_access_token;
    }
    const msg = (e as Error).message;
    if (/invalid_grant|refresh_token|expired|invalid/i.test(msg)) {
      throw new Error("a conexão do TikTok expirou: reconecte em Admin → Redes sociais → TikTok");
    }
    throw e;
  }
}

/** URL pública da arte pelo domínio verificado (o TikTok não aceita o domínio do Supabase). */
export function tiktokMediaUrl(storageUrl: string): string {
  const m = storageUrl.match(/\/storage\/v1\/object\/public\/brand\/(.+)$/);
  return m ? `${siteUrl()}/tiktok/m/${m[1]}` : storageUrl;
}

/**
 * Manda a arte como rascunho de foto para a caixa de entrada do TikTok.
 * Devolve o publish_id. Limite do TikTok: 5 rascunhos pendentes por 24 h.
 */
export async function tiktokSendDraft(db: SupabaseClient, opts: { imageUrl: string; title: string; description: string }): Promise<string> {
  const token = await accessToken(db);
  const res = await fetch(`${API}/v2/post/publish/content/init/`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: { title: opts.title.slice(0, 90), description: opts.description.slice(0, 4000) },
      source_info: { source: "PULL_FROM_URL", photo_images: [tiktokMediaUrl(opts.imageUrl)], photo_cover_index: 0 },
      post_mode: "MEDIA_UPLOAD",
      media_type: "PHOTO",
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { publish_id?: string }; error?: { code?: string; message?: string } };
  if (!res.ok || (json.error?.code && json.error.code !== "ok") || !json.data?.publish_id) {
    const code = json.error?.code || `HTTP ${res.status}`;
    const hint: Record<string, string> = {
      url_ownership_unverified: "o endereço das artes ainda não foi verificado no app do TikTok",
      spam_risk_too_many_pending_share: "já há 5 rascunhos pendentes na caixa de entrada (publique ou apague alguns)",
      scope_not_authorized: "a conta foi conectada sem a permissão video.upload",
      access_token_invalid: "conexão expirada: conecte o TikTok de novo",
    };
    throw new Error(hint[code] || json.error?.message || code);
  }
  return json.data.publish_id;
}

/**
 * Manda um vídeo (MP4) como rascunho para a caixa de entrada do TikTok.
 * Você abre o app, escolhe o som e publica. Mesmo limite: 5 rascunhos pendentes por 24 h.
 */
export async function tiktokSendVideoDraft(db: SupabaseClient, videoUrl: string): Promise<string> {
  const token = await accessToken(db);
  const res = await fetch(`${API}/v2/post/publish/inbox/video/init/`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ source_info: { source: "PULL_FROM_URL", video_url: tiktokMediaUrl(videoUrl) } }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { publish_id?: string }; error?: { code?: string; message?: string } };
  if (!res.ok || (json.error?.code && json.error.code !== "ok") || !json.data?.publish_id) {
    const code = json.error?.code || `HTTP ${res.status}`;
    const hint: Record<string, string> = {
      url_ownership_unverified: "o endereço dos vídeos ainda não foi verificado no app do TikTok",
      spam_risk_too_many_pending_share: "já há 5 rascunhos pendentes na caixa de entrada (publique ou apague alguns)",
      scope_not_authorized: "a conta foi conectada sem a permissão video.upload",
      access_token_invalid: "conexão expirada: conecte o TikTok de novo",
    };
    throw new Error(hint[code] || json.error?.message || code);
  }
  return json.data.publish_id;
}

/** Arquivo de verificação de URL do TikTok (servido em /tiktok/<arquivo>). */
export async function tiktokVerifyFile(db: SupabaseClient, name: string): Promise<string | null> {
  const kv = await kvGet(db, ["tiktok_verify"]);
  try {
    const files = JSON.parse(kv.tiktok_verify || "{}") as Record<string, string>;
    return files[name] ?? null;
  } catch {
    return null;
  }
}

export async function tiktokSaveVerifyFile(db: SupabaseClient, name: string, content: string) {
  const kv = await kvGet(db, ["tiktok_verify"]);
  let files: Record<string, string> = {};
  try {
    files = JSON.parse(kv.tiktok_verify || "{}");
  } catch {
    files = {};
  }
  files[name] = content;
  await kvSet(db, { tiktok_verify: JSON.stringify(files) });
}

export async function tiktokSaveKeys(db: SupabaseClient, clientKey: string, clientSecret: string) {
  const values: Record<string, string> = {};
  if (clientKey) values.tiktok_client_key = clientKey;
  if (clientSecret) values.tiktok_client_secret = clientSecret;
  if (Object.keys(values).length) await kvSet(db, values);
}

/** Situação de um envio (PROCESSING_DOWNLOAD, SEND_TO_USER_INBOX, PUBLISH_COMPLETE, FAILED…). */
export async function tiktokPublishStatus(db: SupabaseClient, publishId: string): Promise<{ status: string; reason?: string }> {
  try {
    const token = await accessToken(db);
    const res = await fetch(`${API}/v2/post/publish/status/fetch/`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ publish_id: publishId }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as {
      data?: { status?: string; fail_reason?: string };
      error?: { code?: string; message?: string };
    };
    if (json.error?.code && json.error.code !== "ok") return { status: "ERRO", reason: json.error.message || json.error.code };
    return { status: json.data?.status || "desconhecido", reason: json.data?.fail_reason || undefined };
  } catch (e) {
    return { status: "ERRO", reason: (e as Error).message };
  }
}

// ---------------------------------------------------------------------------
// Postagem direta (Direct Post). Regras do TikTok (Content Sharing Guidelines):
// antes de cada post a pessoa vê a prévia e o nome da conta, escolhe a privacidade (sem opção
// marcada por padrão), liga ou não comentários/dueto/stitch (desligados por padrão), declara se é
// conteúdo comercial e confirma ciente da Music Usage Confirmation. Nada é postado sem esse clique.
// ---------------------------------------------------------------------------

export interface CreatorInfo {
  creator_avatar_url?: string;
  creator_username?: string;
  creator_nickname?: string;
  privacy_level_options: string[];
  comment_disabled: boolean;
  duet_disabled: boolean;
  stitch_disabled: boolean;
  max_video_post_duration_sec: number;
}

function apiError(json: { error?: { code?: string; message?: string } }, status: number): string {
  const code = json.error?.code || `HTTP ${status}`;
  const hint: Record<string, string> = {
    scope_not_authorized: "a conta foi conectada sem a permissão video.publish: ligue a postagem direta e reconecte o TikTok",
    spam_risk_too_many_posts: "limite diário de posts da conta atingido; tente amanhã",
    spam_risk_user_banned_from_posting: "o TikTok bloqueou postagens desta conta temporariamente",
    reached_active_user_cap: "limite diário de usuários do app atingido; tente mais tarde",
    unaudited_client_can_only_post_to_private_accounts: "o app ainda não foi aprovado para postagem pública: só dá para postar como privado (Só eu)",
    privacy_level_option_mismatch: "a privacidade escolhida não está disponível para esta conta",
    url_ownership_unverified: "o endereço dos vídeos ainda não foi verificado no app do TikTok",
    access_token_invalid: "conexão expirada: conecte o TikTok de novo",
  };
  return hint[code] || json.error?.message || code;
}

/** Dados da conta para a tela de publicação (nome, privacidades permitidas, limites). */
export async function tiktokCreatorInfo(db: SupabaseClient): Promise<CreatorInfo> {
  const token = await accessToken(db);
  const res = await fetch(`${API}/v2/post/publish/creator_info/query/`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
    body: "{}",
  });
  const json = (await res.json().catch(() => ({}))) as { data?: CreatorInfo; error?: { code?: string; message?: string } };
  if (!res.ok || (json.error?.code && json.error.code !== "ok") || !json.data) throw new Error(apiError(json, res.status));
  return json.data;
}

export interface DirectPostOptions {
  videoUrl: string;
  title: string;
  privacy: string;
  allowComment: boolean;
  allowDuet: boolean;
  allowStitch: boolean;
  /** conteúdo comercial: "sua marca" (Conteúdo promocional) */
  brandOrganic: boolean;
  /** conteúdo comercial: "conteúdo de marca" de terceiro (Parceria paga) */
  brandContent: boolean;
}

/** Publica o vídeo direto no perfil, com a legenda. Devolve o publish_id. */
export async function tiktokDirectPostVideo(db: SupabaseClient, o: DirectPostOptions): Promise<string> {
  const token = await accessToken(db);
  const res = await fetch(`${API}/v2/post/publish/video/init/`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
    body: JSON.stringify({
      post_info: {
        title: o.title.slice(0, 2200),
        privacy_level: o.privacy,
        disable_comment: !o.allowComment,
        disable_duet: !o.allowDuet,
        disable_stitch: !o.allowStitch,
        brand_organic_toggle: o.brandOrganic,
        brand_content_toggle: o.brandContent,
        video_cover_timestamp_ms: 1000,
      },
      source_info: { source: "PULL_FROM_URL", video_url: tiktokMediaUrl(o.videoUrl) },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { publish_id?: string }; error?: { code?: string; message?: string } };
  if (!res.ok || (json.error?.code && json.error.code !== "ok") || !json.data?.publish_id) throw new Error(apiError(json, res.status));
  return json.data.publish_id;
}
