import type { SupabaseClient } from "@supabase/supabase-js";
import { http, sleep } from "./http";

/**
 * Token de acesso do Mercado Livre, compartilhado entre a coleta e a API de catálogo.
 *
 * O refresh token do ML é de uso único: se dois processos renovarem ao mesmo tempo, um deles
 * recebe invalid_grant. Por isso:
 *  - o access token (vale 6h) fica guardado na kv ("ml_access_token") e é reaproveitado até faltar 10 min;
 *  - só renova quando precisa; se a renovação falhar, relê a kv (outro processo pode ter acabado
 *    de renovar e salvo o token novo) e tenta de novo uma vez.
 */
const API = "https://api.mercadolibre.com";
const KV_REFRESH = "ml_refresh_token";
const KV_ACCESS = "ml_access_token";

type Kv = Record<string, { value: string; updated_at?: string }>;

async function readKv(db: SupabaseClient): Promise<Kv> {
  const { data } = await db.from("kv").select("key,value,updated_at").in("key", [KV_REFRESH, KV_ACCESS]);
  return Object.fromEntries((data || []).map((r) => [r.key, { value: String(r.value || ""), updated_at: r.updated_at }]));
}

function cachedAccess(kv: Kv): string | null {
  const raw = kv[KV_ACCESS]?.value;
  if (!raw) return null;
  try {
    const { token, exp } = JSON.parse(raw) as { token?: string; exp?: number };
    if (token && exp && exp - Date.now() > 10 * 60 * 1000) return token;
  } catch {
    /* formato antigo/inválido */
  }
  return null;
}

async function refresh(db: SupabaseClient, refreshToken: string): Promise<string> {
  const res = await http(`${API}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ML_CLIENT_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });
  const json = (await res.json()) as { access_token: string; refresh_token: string; expires_in?: number };
  const now = new Date().toISOString();
  const exp = Date.now() + (Number(json.expires_in) || 21600) * 1000;
  await db.from("kv").upsert([
    { key: KV_REFRESH, value: json.refresh_token, updated_at: now },
    { key: KV_ACCESS, value: JSON.stringify({ token: json.access_token, exp }), updated_at: now },
  ]);
  return json.access_token;
}

/** Devolve um access token válido. `force` ignora o guardado (usar depois de um 401). */
export async function getMlAccessToken(db: SupabaseClient, force = false): Promise<string> {
  let kv = await readKv(db);
  if (!force) {
    const ok = cachedAccess(kv);
    if (ok) return ok;
  }
  const first = kv[KV_REFRESH]?.value || process.env.ML_REFRESH_TOKEN;
  if (!first) throw new Error("Mercado Livre não conectado. Use o painel: Mercado Livre → Conectar.");
  try {
    return await refresh(db, first);
  } catch (e) {
    // outro processo pode ter renovado agora: relê e tenta com o token novo
    await sleep(1500);
    kv = await readKv(db);
    const again = cachedAccess(kv);
    if (again) return again;
    const second = kv[KV_REFRESH]?.value;
    if (second && second !== first) return await refresh(db, second);
    throw e;
  }
}
