/**
 * Avisa o Bing (IndexNow) que as páginas mudaram — roda depois de cada coleta de preços.
 * Manda todas as URLs do sitemap (os preços mudam todo dia). O ChatGPT usa o Bing para pesquisar.
 *
 *   npm run indexnow
 */
import "dotenv/config";
import { adminClient } from "../lib/supabase";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://cacaofertas.com.br").replace(/\/$/, "");

async function main() {
  const { data } = await adminClient().from("kv").select("value").eq("key", "indexnow_key").maybeSingle();
  const key = data?.value ? String(data.value) : "";
  if (!key) return console.log("Sem chave do IndexNow (kv indexnow_key).");

  const xml = await (await fetch(`${SITE}/sitemap.xml`)).text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()).filter((u) => u.startsWith(SITE));
  if (!urls.length) return console.log("Sitemap vazio.");

  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE).host, key, keyLocation: `${SITE}/indexnow-key.txt`, urlList: urls.slice(0, 10000) }),
  });
  console.log(`IndexNow: ${urls.length} URLs → HTTP ${res.status} ${res.status === 200 || res.status === 202 ? "(aceito)" : await res.text()}`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 0; // aviso ao Bing nunca derruba a coleta
});
