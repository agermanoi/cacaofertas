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
import { serpApi, serpApiSearchesLeft, serpSample } from "../lib/collectors/serpapi";
import { lomadee, lomadeeAffiliateLink, lomadeeBrands } from "../lib/collectors/lomadee";
import { scraper } from "../lib/collectors/scraper";
import { amazonSerp } from "../lib/collectors/amazon";
import { afilio, afilioCampaigns } from "../lib/collectors/afilio";
import { importCoupons } from "./coupons";

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

/** Chaves que podem ficar no banco (tabela kv) em vez de secret do GitHub. O secret, se existir, tem prioridade. */
async function loadKeysFromDb() {
  const map: Record<string, string> = {
    lomadee_api_key: "LOMADEE_API_KEY",
    serpapi_key: "SERPAPI_KEY",
    amazon_associate_tag: "AMAZON_ASSOCIATE_TAG",
    serpapi_google_shopping: "SERPAPI_GOOGLE_SHOPPING",
    afilio_token: "AFILIO_TOKEN",
    afilio_affid: "AFILIO_AFFID",
    afilio_siteid: "AFILIO_SITEID",
    afilio_feeds: "AFILIO_FEEDS",
    serpapi_renew_day: "SERPAPI_RENEW_DAY",
  };
  const { data } = await db.from("kv").select("key, value").in("key", Object.keys(map));
  for (const row of data || []) {
    const env = map[row.key];
    if (env && !process.env[env] && row.value) process.env[env] = String(row.value);
  }
}

/** Sexta-feira da Black Friday (dia seguinte à 4ª quinta-feira de novembro), em UTC. */
function blackFriday(year: number): Date {
  const nov1 = new Date(Date.UTC(year, 10, 1));
  const firstThu = 1 + ((4 - nov1.getUTCDay() + 7) % 7);
  return new Date(Date.UTC(year, 10, firstThu + 21 + 1));
}

/**
 * Divide o saldo da SerpAPI entre as coletas que faltam até o plano renovar
 * (SERPAPI_RENEW_DAY ou kv serpapi_renew_day; padrão dia 1). As coletas da semana
 * da Black Friday (7 dias antes até a Cyber Monday) pesam 3×, para sobrar busca nos dias
 * que mais importam. Escolhe os produtos consultados há mais tempo. Devolve os slugs liberados.
 */
async function serpBudget(products: Product[], collectors: Collector[]): Promise<Set<string>> {
  const serpSources = collectors.filter((c) => SERP_SOURCES.has(c.source)).length;
  if (!serpSources) return new Set();
  const left = await serpApiSearchesLeft();
  const now = new Date();
  const renewDay = Math.min(31, Math.max(1, Number(process.env.SERPAPI_RENEW_DAY || 1)));
  // dia 31 em mês de 30 dias (ou 29/30/31 em fevereiro) vira o último dia do mês
  const renewIn = (y: number, m: number) => new Date(Date.UTC(y, m, Math.min(renewDay, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
  let renew = renewIn(now.getUTCFullYear(), now.getUTCMonth());
  if (renew <= now) renew = renewIn(now.getUTCFullYear(), now.getUTCMonth() + 1);
  // coletas agendadas (00:17 e 12:17 UTC) de agora até a renovação, com peso
  const weight = (d: Date) => {
    const bf = blackFriday(d.getUTCFullYear()).getTime();
    const t = d.getTime();
    return t >= bf - 7 * 86_400_000 && t < bf + 4 * 86_400_000 ? 3 : 1;
  };
  let total = 0;
  let runsLeft = 0;
  for (let t = new Date(now); t < renew; t = new Date(t.getTime() + 12 * 3600_000)) {
    total += weight(t);
    runsLeft++;
  }
  total = Math.max(1, total);
  const reserve = Number(process.env.SERPAPI_RESERVE || 5); // sobra para testes manuais
  const budget =
    left == null
      ? Number(process.env.SERPAPI_MAX_PER_RUN || 8)
      : Math.max(0, Math.floor(((left - reserve) * weight(now)) / total / serpSources));

  const { data } = await db.from("kv").select("value").eq("key", "serpapi_seen").maybeSingle();
  let seen: Record<string, string> = {};
  try {
    seen = JSON.parse(data?.value || "{}");
  } catch {}
  const pick = products
    .slice()
    .sort((a, b) => (seen[a.slug] || "").localeCompare(seen[b.slug] || "") || b.popularity - a.popularity)
    .slice(0, Math.min(budget, products.length));
  for (const p of pick) seen[p.slug] = now.toISOString();
  if (pick.length) await db.from("kv").upsert({ key: "serpapi_seen", value: JSON.stringify(seen), updated_at: now.toISOString() });
  console.log(`SerpAPI: saldo ${left ?? "?"} · ${runsLeft} coletas até renovar em ${renew.toISOString().slice(0, 10)} · ${pick.length} produtos nesta coleta`);
  serpInfo = { left, runsLeft, budget, used: pick.length, renew: renew.toISOString().slice(0, 10) };
  return new Set(pick.map((p) => p.slug));
}
let serpInfo: Record<string, unknown> | null = null;
/** Fontes que gastam buscas da SerpAPI. */
const SERP_SOURCES = new Set(["amazon", "serpapi"]);

const afilioCollector = afilio();

async function main() {
  await loadKeysFromDb();
  // Diagnóstico: quais lojas a conta Lomadee enxerga (só na coleta completa)
  if (process.env.LOMADEE_API_KEY && process.argv.length <= 2) {
    const info = await lomadeeBrands();
    await db.from("kv").upsert({
      key: "lomadee_brands",
      value: JSON.stringify({ at: new Date().toISOString(), ...info }),
      updated_at: new Date().toISOString(),
    });
    console.log(`Lomadee: ${info.brands.length} lojas visíveis${info.error ? ` (erro: ${info.error})` : ""}`);
  }
  // Diagnóstico: campanhas da conta Afilio (1 requisição)
  if (process.env.AFILIO_TOKEN && process.env.AFILIO_AFFID) {
    const info = await afilioCampaigns();
    await db.from("kv").upsert({
      key: "afilio_campaigns",
      value: JSON.stringify({ at: new Date().toISOString(), ...info }),
      updated_at: new Date().toISOString(),
    });
    console.log(`Afilio: ${info.list.length} campanhas${info.error ? ` (erro: ${info.error})` : ""}`);
  }
  // Cupons das redes (Lomadee, Afilio): só na coleta completa
  if (process.argv.length <= 2 || process.env.IMPORT_COUPONS === "1") await importCoupons(db);
  // Aceita slugs separados por espaço ou vírgula
  const slugs = process.argv.slice(2).flatMap((a) => a.split(/[,\s]+/)).filter(Boolean);
  const collectors: Collector[] = [mercadoLivre(db), amazonSerp(), serpApi(), lomadee(), afilioCollector, scraper()].filter((c) => c.enabled());
  const products = await loadProducts(slugs);
  const afilioInfo = afilioCollector.enabled() ? await afilioCollector.prepare() : null;

  console.log(`Coleta ${today} · ${products.length} produtos · fontes: ${collectors.map((c) => c.source).join(", ")}`);
  if (!collectors.length) throw new Error("Nenhuma fonte configurada. Veja o .env.example.");
  if (!products.length) throw new Error(`Nenhum produto ativo encontrado${slugs.length ? ` para: ${slugs.join(", ")}` : ""}.`);

  const serpAllowed = await serpBudget(products, collectors);

  const stats: Record<string, { ok: number; fail: number; offers: number }> = {};
  const errors: { source: string; slug: string; message: string }[] = [];
  const zeroOffers: string[] = [];
  const notes: Record<string, string[]> = {};
  for (const c of collectors) stats[c.source] = { ok: 0, fail: 0, offers: 0 };

  for (const product of products) {
    const found: OfferInput[] = [];
    for (const c of collectors) {
      if (SERP_SOURCES.has(c.source) && !serpAllowed.has(product.slug)) continue;
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
    afilio: afilioInfo || undefined,
    serpapi: serpInfo ? { ...serpInfo, sample: serpSample.slice(0, 30) } : undefined,
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
