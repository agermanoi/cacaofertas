import { siteUrl } from "./site";
import "server-only";
import { adminClient } from "./supabase";

/**
 * OAuth do Mercado Livre feito pelo painel (/admin/mercadolivre).
 * O refresh token fica na tabela kv ("ml_refresh_token"), a mesma que a coleta usa
 * e atualiza a cada execução (o ML troca o refresh token a cada uso).
 *
 * Env (Vercel): ML_CLIENT_ID, ML_CLIENT_SECRET
 *               ML_REDIRECT_URI (opcional; padrão NEXT_PUBLIC_SITE_URL + /admin/mercadolivre)
 */

export const ML_STATE_COOKIE = "ml_oauth_state";
const KV_TOKEN = "ml_refresh_token";
const KV_USER = "ml_user";

export function mlConfigured(): boolean {
  return Boolean(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET);
}

export function mlRedirectUri(): string {
  if (process.env.ML_REDIRECT_URI) return process.env.ML_REDIRECT_URI;
  const site = siteUrl();
  return `${site}/admin/mercadolivre`;
}

export function mlAuthorizeUrl(state: string): string {
  const u = new URL("https://auth.mercadolivre.com.br/authorization");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", process.env.ML_CLIENT_ID!);
  u.searchParams.set("redirect_uri", mlRedirectUri());
  u.searchParams.set("state", state);
  return u.toString();
}

export interface MlStatus {
  connected: boolean;
  nickname?: string;
  updatedAt?: string;
}

export async function mlStatus(): Promise<MlStatus> {
  const { data } = await adminClient().from("kv").select("key, value, updated_at").in("key", [KV_TOKEN, KV_USER]);
  const token = data?.find((r) => r.key === KV_TOKEN);
  const user = data?.find((r) => r.key === KV_USER);
  return { connected: Boolean(token?.value), nickname: user?.value || undefined, updatedAt: token?.updated_at };
}

/** Troca o code pelo refresh token, confere a conta e salva no banco. */
export async function mlExchangeCode(code: string): Promise<{ ok: true; nickname: string } | { ok: false; error: string }> {
  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.ML_CLIENT_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      code,
      redirect_uri: mlRedirectUri(),
    }),
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    refresh_token?: string;
    message?: string;
    error?: string;
  };
  if (!res.ok || !json.refresh_token || !json.access_token) {
    const why = json.message || json.error || `HTTP ${res.status}`;
    if (!json.refresh_token && res.ok) {
      return { ok: false, error: "O Mercado Livre não devolveu o refresh token. Ative o escopo offline_access no seu app e conecte de novo." };
    }
    return { ok: false, error: `O Mercado Livre recusou a autorização: ${why}. Confira o Client ID, o Client Secret e a Redirect URI do app.` };
  }

  let nickname = "conta conectada";
  try {
    const me = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { authorization: `Bearer ${json.access_token}` },
      cache: "no-store",
    });
    if (me.ok) nickname = ((await me.json()) as { nickname?: string }).nickname || nickname;
  } catch {
    /* só informativo */
  }

  const now = new Date().toISOString();
  const { error } = await adminClient()
    .from("kv")
    .upsert([
      { key: KV_TOKEN, value: json.refresh_token, updated_at: now },
      { key: KV_USER, value: nickname, updated_at: now },
    ]);
  if (error) return { ok: false, error: `Autorizado, mas não consegui salvar no banco: ${error.message}` };
  return { ok: true, nickname };
}

export async function mlDisconnect(): Promise<void> {
  await adminClient().from("kv").delete().in("key", [KV_TOKEN, KV_USER]);
}
