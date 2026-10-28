/**
 * Autorização única do Mercado Livre (OAuth).
 *
 * 1) npm run ml:auth
 *    -> imprime a URL de autorização. Abra, faça login e autorize.
 *       Você será redirecionado para ML_REDIRECT_URI?code=TG-xxxx
 * 2) npm run ml:auth -- TG-xxxx
 *    -> troca o código pelo refresh token e salva no Supabase (tabela kv).
 *
 * A partir daí a coleta renova o token sozinha.
 */
import "dotenv/config";
import { adminClient } from "../lib/supabase";

const { ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REDIRECT_URI } = process.env;

async function main() {
  if (!ML_CLIENT_ID || !ML_CLIENT_SECRET || !ML_REDIRECT_URI) {
    throw new Error("Defina ML_CLIENT_ID, ML_CLIENT_SECRET e ML_REDIRECT_URI no .env");
  }
  const code = process.argv[2];

  if (!code) {
    const url = new URL("https://auth.mercadolivre.com.br/authorization");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", ML_CLIENT_ID);
    url.searchParams.set("redirect_uri", ML_REDIRECT_URI);
    console.log("\nAbra esta URL, autorize e copie o parâmetro ?code= do redirecionamento:\n");
    console.log(url.toString(), "\n");
    console.log("Depois rode: npm run ml:auth -- TG-SEU-CODIGO\n");
    return;
  }

  const res = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      code,
      redirect_uri: ML_REDIRECT_URI,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.refresh_token) {
    throw new Error(`Falhou (${res.status}): ${JSON.stringify(json)}`);
  }

  await adminClient()
    .from("kv")
    .upsert({ key: "ml_refresh_token", value: json.refresh_token, updated_at: new Date().toISOString() });
  console.log("✓ Refresh token salvo no Supabase. A coleta do Mercado Livre está pronta.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
