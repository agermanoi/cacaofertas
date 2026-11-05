/**
 * Apaga do Storage as artes e os vídeos dos posts com mais de 30 dias (pasta brand/social/).
 * O registro do post continua no banco (serve para não repetir oferta e para o histórico);
 * só o arquivo some — depois de publicado, Instagram, Facebook e TikTok guardam a cópia deles.
 *
 *   npm run cleanup-media            apaga
 *   npm run cleanup-media -- --dry   só mostra o que apagaria
 */
import "dotenv/config";
import { adminClient } from "../lib/supabase";

const KEEP_DAYS = Number(process.env.MEDIA_KEEP_DAYS || 30);
const dry = process.argv.includes("--dry");
const db = adminClient();
const bucket = db.storage.from("brand");

/** Pastas por dia: social/AAAA-MM-DD/… e social/video/AAAA-MM-DD/… */
async function oldDayFolders(prefix: string, cutoff: string): Promise<string[]> {
  const { data, error } = await bucket.list(prefix, { limit: 1000 });
  if (error) throw new Error(`listar ${prefix}: ${error.message}`);
  return (data || [])
    .filter((e) => !e.metadata && /^\d{4}-\d{2}-\d{2}$/.test(e.name) && e.name < cutoff)
    .map((e) => `${prefix}/${e.name}`);
}

async function main() {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
  const folders = [...(await oldDayFolders("social", cutoff)), ...(await oldDayFolders("social/video", cutoff))];
  let files = 0;
  let bytes = 0;
  for (const folder of folders) {
    const { data } = await bucket.list(folder, { limit: 1000 });
    const paths = (data || []).filter((f) => f.metadata).map((f) => `${folder}/${f.name}`);
    bytes += (data || []).reduce((n, f) => n + Number((f.metadata as { size?: number } | null)?.size || 0), 0);
    files += paths.length;
    if (!dry && paths.length) {
      const { error } = await bucket.remove(paths);
      if (error) console.warn(`  ✗ ${folder}: ${error.message}`);
    }
  }
  console.log(`${dry ? "Apagaria" : "Apagados"}: ${files} arquivos (${(bytes / 1024 / 1024).toFixed(1)} MB) de ${folders.length} dias anteriores a ${cutoff}.`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 0; // limpeza nunca derruba a coleta
});
