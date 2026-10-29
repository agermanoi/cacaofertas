/**
 * Conecta a Página do Facebook e o Instagram (Meta Graph API).
 *
 * Lê da tabela kv: meta_app_id, meta_app_secret, meta_user_token (token curto do Explorador da API).
 * 1) troca o token curto por um token de usuário de longa duração;
 * 2) busca as páginas da conta e pega o token da página (não expira quando vem do token longo);
 * 3) acha a conta do Instagram ligada à página;
 * 4) grava meta_page_id, meta_page_name, meta_page_token, meta_ig_id, meta_ig_username e apaga o token curto.
 * O resultado vai para kv "meta_status" (aparece no painel).
 *
 * npm run meta:setup
 */
import "dotenv/config";
import { adminClient } from "../lib/supabase";

const GRAPH = "https://graph.facebook.com/v21.0";
const db = adminClient();

async function kv(key: string): Promise<string> {
  const { data } = await db.from("kv").select("value").eq("key", key).maybeSingle();
  return String(data?.value || "");
}
async function setKv(key: string, value: string) {
  await db.from("kv").upsert({ key, value, updated_at: new Date().toISOString() });
}

async function graph<T = any>(path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`);
  const json = (await res.json()) as any;
  if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
  return json as T;
}

async function main() {
  const appId = await kv("meta_app_id");
  const secret = await kv("meta_app_secret");
  const short = await kv("meta_user_token");
  if (!appId || !secret) throw new Error("Faltam meta_app_id e meta_app_secret na tabela kv.");

  let userToken = short;
  if (short) {
    const long = await graph<{ access_token: string }>("/oauth/access_token", {
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: secret,
      fb_exchange_token: short,
    });
    userToken = long.access_token;
    await setKv("meta_user_token_long", userToken);
  } else {
    userToken = await kv("meta_user_token_long");
  }
  if (!userToken) throw new Error("Nenhum token de usuário. Gere um no Explorador da API do Graph.");

  const perms = await graph<{ data: { permission: string; status: string }[] }>("/me/permissions", { access_token: userToken });
  const granted = perms.data.filter((p) => p.status === "granted").map((p) => p.permission);

  const pages = await graph<{ data: { id: string; name: string; access_token: string }[] }>("/me/accounts", {
    access_token: userToken,
    fields: "id,name,access_token",
  });
  if (!pages.data.length) throw new Error("Nenhuma Página encontrada. Ao gerar o token, marque a página Caça Ofertas.");
  const page = pages.data.find((p) => /ca[çc]a ?ofertas/i.test(p.name)) || pages.data[0];

  const info = await graph<{ instagram_business_account?: { id: string; username?: string } }>(`/${page.id}`, {
    access_token: page.access_token,
    fields: "instagram_business_account{id,username}",
  });

  await setKv("meta_page_id", page.id);
  await setKv("meta_page_name", page.name);
  await setKv("meta_page_token", page.access_token);
  if (info.instagram_business_account?.id) {
    await setKv("meta_ig_id", info.instagram_business_account.id);
    await setKv("meta_ig_username", info.instagram_business_account.username || "");
  }
  // o token curto não serve mais
  await db.from("kv").delete().eq("key", "meta_user_token");

  const status = {
    at: new Date().toISOString(),
    ok: true,
    page: { id: page.id, name: page.name },
    instagram: info.instagram_business_account || null,
    permissions: granted,
    pages_found: pages.data.map((p) => p.name),
  };
  await setKv("meta_status", JSON.stringify(status));
  console.log(JSON.stringify(status, null, 2));
}

main().catch(async (e) => {
  console.error(e);
  await setKv("meta_status", JSON.stringify({ at: new Date().toISOString(), ok: false, error: String(e?.message || e) }));
  process.exit(1);
});
