import type { SupabaseClient } from "@supabase/supabase-js";
import { siteUrl } from "./site";

/**
 * TikTok (Content Posting API). Manda cada post como RASCUNHO para a caixa de entrada
 * do TikTok (post_mode MEDIA_UPLOAD, escopo video.upload): você abre o app, escolhe a
 * música e publica. Não precisa da auditoria do TikTok, que só é exigida para postar
 * público direto pela API.
 *
 * Chaves na tabela kv (gravadas pelo painel em /admin/tiktok):
 *   tiktok_client_key, tiktok_client_secret       app em developers.tiktok.com
 *   tiktok_access_token, tiktok_access_expires     token de 24 h (renovado sozinho)
 *   tiktok_refresh_token                           válido por 365 dias, pode mudar a cada renovação
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

export async function tiktokAuthorizeUrl(db: SupabaseClient, state: string): Promise<string | null> {
  const kv = await kvGet(db, ["tiktok_client_key"]);
  if (!kv.tiktok_client_key) return null;
  const p = new URLSearchParams({
    client_key: kv.tiktok_client_key,
    scope: TIKTOK_SCOPES,
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
    tiktok_access_expires: new Date(now + (t.expires_in || 86400) * 1000).toISOString(),
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
async function accessToken(db: SupabaseClient): Promise<string> {
  const kv = await kvGet(db, ["tiktok_client_key", "tiktok_client_secret", "tiktok_access_token", "tiktok_access_expires", "tiktok_refresh_token"]);
  if (!kv.tiktok_refresh_token) throw new Error("TikTok não conectado.");
  if (kv.tiktok_access_token && new Date(kv.tiktok_access_expires).getTime() - Date.now() > 10 * 60_000) return kv.tiktok_access_token;
  const t = await tokenRequest({
    client_key: kv.tiktok_client_key,
    client_secret: kv.tiktok_client_secret,
    grant_type: "refresh_token",
    refresh_token: kv.tiktok_refresh_token,
  });
  await saveTokens(db, t);
  return t.access_token!;
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
