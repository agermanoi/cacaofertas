/**
 * Posts automáticos no Instagram e no Facebook. Roda depois de cada coleta.
 *
 *   npm run social                 escolhe as ofertas do momento (conforme o painel)
 *   npm run social -- iphone-15    força um produto (ignora "já postado")
 *
 * Modo "aprovação": só cria na fila; o post sai quando você clica em Publicar no painel.
 * Modo "automático": cria e publica na hora.
 */
import "dotenv/config";
import { adminClient } from "../lib/supabase";
import type { ProductOverview } from "../lib/types";
import { verdictFor } from "../lib/verdict";
import { getMetaAccount, getSocialConfig, pickCandidates, publishPost, queuePost, type Candidate } from "../lib/social";

const db = adminClient();

async function main() {
  const cfg = await getSocialConfig(db);
  const acc = await getMetaAccount(db);
  const slugs = process.argv.slice(2).flatMap((a) => a.split(",")).map((s) => s.trim()).filter(Boolean);
  const summary: Record<string, unknown> = { at: new Date().toISOString(), mode: cfg.mode, queued: [], published: [], errors: [] };

  if (!slugs.length && !cfg.enabled) {
    console.log("Posts automáticos desligados no painel.");
    return;
  }
  if (!acc.pageToken) throw new Error("Facebook/Instagram não conectados (rode a ação 'Conectar Facebook e Instagram').");

  let list: Candidate[];
  if (slugs.length) {
    const { data } = await db.from("product_overview").select("*").in("slug", slugs).not("best_price", "is", null);
    list = ((data || []) as ProductOverview[]).map((p) => ({ p, v: verdictFor(p), reason: "popular" as const }));
  } else {
    list = await pickCandidates(db, cfg);
  }
  console.log(`${list.length} oferta(s) escolhida(s): ${list.map((c) => `${c.p.slug} [${c.reason}]`).join(", ") || "nenhuma"}`);

  for (const c of list) {
    try {
      const id = await queuePost(db, c, cfg);
      (summary.queued as string[]).push(c.p.slug);
      console.log(`  fila #${id}: ${c.p.slug}`);
      if (cfg.mode === "auto") {
        const r = await publishPost(db, id, cfg);
        if (r.ok) (summary.published as string[]).push(c.p.slug);
        if (r.error) (summary.errors as string[]).push(`${c.p.slug}: ${r.error}`);
        console.log(`  ${r.ok ? "publicado" : "falhou"}${r.error ? `: ${r.error}` : ""}`);
      }
    } catch (e) {
      (summary.errors as string[]).push(`${c.p.slug}: ${(e as Error).message}`);
      console.error(`  erro em ${c.p.slug}:`, (e as Error).message);
    }
  }
  await db.from("kv").upsert({ key: "social_last_run", value: JSON.stringify(summary), updated_at: new Date().toISOString() });
}

main().catch(async (e) => {
  console.error(e);
  await db
    .from("kv")
    .upsert({ key: "social_last_run", value: JSON.stringify({ at: new Date().toISOString(), errors: [String(e?.message || e)] }), updated_at: new Date().toISOString() });
  process.exit(1);
});
