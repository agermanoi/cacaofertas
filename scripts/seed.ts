/**
 * Cadastra no Supabase os produtos de data/products.json (com a ficha de data/specs.json).
 *   npm run seed                 -> só insere os produtos que ainda não existem
 *   npm run seed -- --atualizar  -> sobrescreve também os existentes (desfaz edições do /admin)
 * Nunca apaga produtos.
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adminClient } from "../lib/supabase";

type Seed = {
  slug: string;
  name: string;
  category: string;
  query: string;
  must?: string[];
  exclude?: string[];
  min_price?: number;
  max_price?: number;
  scrape_urls?: string[];
  popularity?: number;
};

async function main() {
  const db = adminClient();
  const seeds: Seed[] = JSON.parse(readFileSync(join(process.cwd(), "data/products.json"), "utf8"));
  const specs: Record<string, unknown> = JSON.parse(readFileSync(join(process.cwd(), "data/specs.json"), "utf8"));
  const overwrite = process.argv.includes("--atualizar");

  const rows = seeds.map((s) => ({
    slug: s.slug,
    name: s.name,
    category: s.category,
    query: s.query,
    must: s.must ?? [],
    exclude: s.exclude ?? [],
    min_price: s.min_price ?? 0,
    max_price: s.max_price ?? null,
    popularity: s.popularity ?? 0,
    specs: specs[s.slug] ?? null,
    ...(s.scrape_urls ? { scrape_urls: s.scrape_urls } : {}),
  }));

  const { data, error } = await db
    .from("products")
    .upsert(rows, { onConflict: "slug", ignoreDuplicates: !overwrite })
    .select("slug");
  if (error) throw error;
  const n = data?.length ?? 0;
  console.log(
    overwrite
      ? `✓ ${n} produtos cadastrados/atualizados`
      : `✓ ${n} produtos novos cadastrados (${rows.length - n} já existiam e foram mantidos)`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
