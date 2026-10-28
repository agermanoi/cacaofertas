/**
 * Coleta diária de preços.
 *   npm run collect                 -> todos os produtos ativos
 *   npm run collect -- iphone-16    -> só os slugs informados
 *
 * Roda no GitHub Actions (.github/workflows/collect.yml) ou na sua máquina.
 */
import "dotenv/config";
import { adminClient } from "../lib/supabase";
import { selectOffers } from "../lib/match";
import type { Collector, OfferInput, Product } from "../lib/types";
import { mercadoLivre } from "../lib/collectors/mercadolivre";
import { serpApi } from "../lib/collectors/serpapi";
import { lomadee, lomadeeAffiliateLink } from "../lib/collectors/lomadee";
import { scraper } from "../lib/collectors/scraper";

const db = adminClient();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()); // AAAA-MM-DD
const PER_STORE = Number(process.env.OFFERS_PER_STORE || 3);

async function loadProducts(slugs: string[]): Promise<Product[]> {
  let q = db.from("products").select("*").eq("active", true).order("popularity", { ascending: false });
  if (slugs.length) q = q.in("slug", slugs);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as Product[];
}

async function saveOffers(product: Product, offers: OfferInput[]): Promise<number> {
  if (!offers.length) return 0;

  const { data: existing } = await db
    .from("offers")
    .select("id, source, external_id, affiliate_url")
    .eq("product_id", product.id);
  const known = new Map((existing || []).map((o) => [`${o.source}:${o.external_id}`, o]));

  const now = new Date().toISOString();
  const rows = [];
  for (const o of offers) {
    const prev = known.get(`${o.source}:${o.externalId}`);
    let affiliate = o.affiliateUrl || prev?.affiliate_url || null;
    if (!affiliate && o.source === "lomadee" && o.meta?.organizationId) {
      affiliate = await lomadeeAffiliateLink(o.meta.organizationId, o.url);
    }
    rows.push({
      product_id: product.id,
      source: o.source,
      store: o.store.slice(0, 120),
      external_id: o.externalId.slice(0, 500),
      title: o.title.slice(0, 300),
      url: o.url,
      affiliate_url: affiliate,
      image_url: o.imageUrl || null,
      last_price: o.price,
      last_list_price: o.listPrice && o.listPrice > o.price ? o.listPrice : null,
      active: true,
      last_seen_at: now,
    });
  }

  const { data: saved, error } = await db
    .from("offers")
    .upsert(rows, { onConflict: "product_id,source,external_id" })
    .select("id, last_price, last_list_price");
  if (error) throw error;

  // Histórico: guarda o MENOR preço visto no dia para cada oferta
  const ids = (saved || []).map((s) => s.id);
  const { data: todays } = await db
    .from("price_history")
    .select("offer_id, price")
    .in("offer_id", ids)
    .eq("captured_on", today);
  const todayPrice = new Map((todays || []).map((t) => [t.offer_id, Number(t.price)]));

  const history = (saved || [])
    .filter((s) => !todayPrice.has(s.id) || Number(s.last_price) < todayPrice.get(s.id)!)
    .map((s) => ({
      offer_id: s.id,
      product_id: product.id,
      price: s.last_price,
      list_price: s.last_list_price,
      captured_on: today,
      captured_at: now,
    }));
  if (history.length) {
    const { error: hErr } = await db.from("price_history").upsert(history, { onConflict: "offer_id,captured_on" });
    if (hErr) throw hErr;
  }

  if (!product.image_url) {
    const img = offers.find((o) => o.imageUrl)?.imageUrl;
    if (img) await db.from("products").update({ image_url: img }).eq("id", product.id);
  }
  return rows.length;
}

async function main() {
  // Aceita slugs separados por espaço ou vírgula
  const slugs = process.argv.slice(2).flatMap((a) => a.split(/[,\s]+/)).filter(Boolean);
  const collectors: Collector[] = [mercadoLivre(db), serpApi(), lomadee(), scraper()].filter((c) => c.enabled());
  const products = await loadProducts(slugs);

  console.log(`Coleta ${today} · ${products.length} produtos · fontes: ${collectors.map((c) => c.source).join(", ")}`);
  if (!collectors.length) throw new Error("Nenhuma fonte configurada. Veja o .env.example.");
  if (!products.length) throw new Error(`Nenhum produto ativo encontrado${slugs.length ? ` para: ${slugs.join(", ")}` : ""}.`);

  const stats: Record<string, { ok: number; fail: number; offers: number }> = {};
  const errors: { source: string; slug: string; message: string }[] = [];
  const zeroOffers: string[] = [];
  const notes: Record<string, string[]> = {};
  for (const c of collectors) stats[c.source] = { ok: 0, fail: 0, offers: 0 };

  for (const product of products) {
    const found: OfferInput[] = [];
    for (const c of collectors) {
      try {
        const raw = await c.collect(product);
        // URLs de raspagem são escolhidas a dedo: só checa faixa de preço
        const picked =
          c.source === "scraper"
            ? raw.filter((o) => o.price >= Number(product.min_price || 0))
            : selectOffers(product, raw, PER_STORE);
        found.push(...picked);
        if (raw.length && !picked.length) {
          const ex = raw.slice().sort((a, b) => a.price - b.price)[0];
          (notes[product.slug] ||= []).push(
            `${c.source}: ${raw.length} oferta(s) recusada(s) pelo filtro, ex.: ${ex.title} · R$ ${ex.price.toFixed(2)}`
          );
        }
        stats[c.source].ok++;
        stats[c.source].offers += picked.length;
      } catch (e) {
        stats[c.source].fail++;
        errors.push({ source: c.source, slug: product.slug, message: (e as Error).message.slice(0, 300) });
        console.warn(`  ✗ ${c.source} · ${product.slug}: ${(e as Error).message}`);
      }
    }
    const n = await saveOffers(product, found);
    if (!n) zeroOffers.push(product.slug);
    const best = found.length ? Math.min(...found.map((o) => o.price)) : null;
    console.log(`  ${n ? "✓" : "·"} ${product.slug}: ${n} ofertas${best ? ` · melhor R$ ${best.toFixed(2)}` : ""}`);
  }

  console.table(stats);

  // Resumo da execução no banco (aparece no /admin e ajuda a diagnosticar sem abrir o GitHub)
  const summary = {
    at: new Date().toISOString(),
    products: products.length,
    sources: collectors.map((c) => c.source),
    stats,
    totalOffers: Object.values(stats).reduce((n, s) => n + s.offers, 0),
    errors: errors.slice(0, 40),
    // produtos que ficaram sem oferta, com os nomes que as fontes devolveram e o filtro recusou
    misses: Object.fromEntries(
      zeroOffers.map((slug) => [
        slug,
        [
          ...(notes[slug] || []),
          ...collectors.flatMap((c) => (c.rejected?.[slug] || []).map((name) => `${c.source}: ${name}`)),
        ].slice(0, 8),
      ])
    ),
    errorCount: errors.length,
  };
  await db.from("kv").upsert({ key: "last_collect", value: JSON.stringify(summary), updated_at: summary.at });
  // A raspagem sem URLs cadastradas sempre "dá certo"; ela não conta como fonte funcionando.
  const apiSources = Object.entries(stats).filter(([src]) => src !== "scraper");
  const failedApis = apiSources.filter(([, s]) => s.ok === 0 && s.fail > 0).map(([src]) => src);
  const totalOffers = Object.values(stats).reduce((n, s) => n + s.offers, 0);
  if (failedApis.length) console.error(`\n✗ Fonte(s) com falha em todos os produtos: ${failedApis.join(", ")}. Veja os erros acima.`);
  if (products.length && totalOffers === 0) console.error("\n✗ Nenhuma oferta encontrada nesta coleta.");
  if (products.length && (failedApis.length || totalOffers === 0)) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
