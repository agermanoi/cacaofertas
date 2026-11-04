import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDailySeries, getOverview, lastPriceUpdate } from "@/lib/data";
import { periodLabel, verdictFor } from "@/lib/verdict";
import { MIN_ITEMS, guideBySlug, guideItems, liveGuides } from "@/lib/guides";
import { breadcrumbLd, faqLd } from "@/lib/seo";
import { siteUrl } from "@/lib/site";
import { money } from "@/lib/format";
import { Catalog, type CatalogItem } from "@/components/Catalog";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const guide = guideBySlug(slug);
  if (!guide) return null;
  const all = await getOverview();
  const items = guideItems(guide, all);
  if (items.length < MIN_ITEMS) return null;
  return { guide, items, all };
}

export async function generateStaticParams() {
  return liveGuides(await getOverview()).map((g) => ({ slug: g.guide.slug }));
}

const today = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" });

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Página não encontrada" };
  const { guide, items } = data;
  const first = items[0];
  return {
    title: `${guide.title} hoje: menor preço e histórico`,
    description: `${guide.title} em ${today()}: ${items.length} opções a partir de ${money(Number(first.best_price))} (${first.name}). Compare com a média recente e veja se o desconto é real.`,
    alternates: { canonical: `/precos/${slug}` },
  };
}

export default async function GuidePage({ params }: Params) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { guide, items, all } = data;
  const fem = guide.art === "a";
  const barato = fem ? "mais barata" : "mais barato";
  const range = guide.range ? ` ${guide.range}` : "";

  const series = await getDailySeries(items.map((p) => p.id), 30);
  const rows = items.map((p) => ({ p, v: verdictFor(p) }));
  const catalog: CatalogItem[] = rows.map(({ p, v }) => ({ product: p, verdict: v, series: series.get(p.id) || [] }));
  const first = rows[0];
  const deals = rows.filter((r) => r.v.kind === "record" || r.v.kind === "below").sort((a, b) => (b.v.vsAvg ?? 0) - (a.v.vsAvg ?? 0));
  const inflated = rows.filter((r) => r.v.kind === "fake" || r.v.kind === "half");
  const at = (r: (typeof rows)[number]) => (r.p.best_store ? ` (${r.p.best_store})` : "");

  const faq = [
    {
      q: `Qual ${guide.art} ${guide.noun} ${barato}${range} hoje?`,
      a: `Em ${today()}, ${fem ? "a" : "o"} ${barato} é ${first.p.name}, por ${money(Number(first.p.best_price))}${at(first)}. Comparamos ${items.length} opções; os preços mudam ao longo do dia.`,
    },
    {
      q: `Qual ${guide.art} ${guide.noun}${range} com o maior desconto real hoje?`,
      a: deals.length
        ? `${deals[0].p.name}: ${money(Number(deals[0].p.best_price))}${at(deals[0])}, ${Math.round((deals[0].v.vsAvg || 0) * 100)}% abaixo da média dos últimos ${periodLabel(deals[0].p.days_tracked)}.${deals.length > 1 ? ` Também estão abaixo da média: ${deals.slice(1, 3).map((d) => d.p.name).join(" e ")}.` : ""}`
        : "Hoje nenhum está abaixo da média recente: os preços estão na faixa de sempre.",
    },
    {
      q: `Vale esperar a Black Friday para comprar ${guide.art === "a" ? "uma" : "um"} ${guide.noun}?`,
      a: `${deals.length ? `${deals.length} ${deals.length === 1 ? "opção já está" : "opções já estão"} abaixo da média hoje. ` : ""}${inflated.length ? `${inflated.length} ${inflated.length === 1 ? "anúncio mostra" : "anúncios mostram"} desconto maior do que o real. ` : ""}Se não tiver pressa, acompanhe o histórico de cada produto: uma queda real aparece aqui no mesmo dia.`,
    },
  ];

  const base = siteUrl();
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${guide.title} hoje`,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: items.length,
    itemListElement: items.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${base}/produto/${p.slug}`, name: p.name })),
  };
  const others = liveGuides(all).filter((g) => g.guide.slug !== slug);

  return (
    <div className="wrap category-page guide-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd(faq)) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbLd([
              { name: "Início", path: "/" },
              { name: "Guias de preço", path: "/precos" },
              { name: guide.title, path: `/precos/${slug}` },
            ])
          ),
        }}
      />
      <nav className="crumbs" aria-label="Você está em">
        <Link href="/">Início</Link> <span aria-hidden="true">/</span> <Link href="/precos">Guias de preço</Link> <span aria-hidden="true">/</span> {guide.title}
      </nav>
      <header className="category-hero">
        <h1>{guide.title} hoje</h1>
        <p className="lede">{guide.intro}</p>
        <p className="category-facts">
          Atualizado em {today()} · {items.length} opções · a partir de <strong>{money(Number(first.p.best_price))}</strong>
          {deals.length ? <> · {deals.length === 1 ? "1 abaixo da média" : `${deals.length} abaixo da média`}</> : null}
        </p>
      </header>

      <section aria-labelledby="ranking" className="guide-rank">
        <h2 id="ranking">Do {barato.replace("mais ", "mais ")} ao mais {fem ? "cara" : "caro"}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Produto</th>
                <th>Menor preço hoje</th>
                <th>Loja</th>
                <th>Vs. média recente</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, v }, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>
                    <Link href={`/produto/${p.slug}`}>{p.name}</Link>
                  </td>
                  <td className="num">{money(Number(p.best_price))}</td>
                  <td>{p.best_store || "—"}</td>
                  <td className={`num v-${v.kind}`}>
                    {v.vsAvg == null || v.kind === "learning"
                      ? "juntando histórico"
                      : v.vsAvg >= 0.01
                        ? `${Math.round(v.vsAvg * 100)}% abaixo`
                        : v.vsAvg <= -0.01
                          ? `${Math.round(-v.vsAvg * 100)}% acima`
                          : "na média"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">Média dos dias que acompanhamos cada produto (até 30). Preços podem mudar a qualquer momento: confira na loja antes de comprar.</p>
      </section>

      <AdSlot id="guia-topo" format="leaderboard" />

      <Catalog items={catalog} title={`${guide.title}: gráficos e vereditos`} showCategories={false} adPrefix="guia" updatedAt={await lastPriceUpdate()} />

      <section aria-labelledby="perguntas" className="faq">
        <h2 id="perguntas">Perguntas frequentes</h2>
        <dl>
          {faq.map((f) => (
            <div key={f.q}>
              <dt>{f.q}</dt>
              <dd>{f.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      {others.length ? (
        <nav className="category-others" aria-label="Outros guias de preço">
          <h2>Outros guias de preço</h2>
          <div className="chips">
            {others.map(({ guide: g }) => (
              <Link key={g.slug} href={`/precos/${g.slug}`}>
                {g.title}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      <AdSlot id="guia-rodape" format="rodape" />
    </div>
  );
}
