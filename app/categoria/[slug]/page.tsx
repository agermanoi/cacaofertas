import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDailySeries, getOverview } from "@/lib/data";
import { verdictFor } from "@/lib/verdict";
import { categoryInfo, categorySlug } from "@/lib/categories";
import { Catalog, type CatalogItem } from "@/components/Catalog";
import { AdSlot } from "@/components/AdSlot";
import { money } from "@/lib/format";

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

async function load(slug: string) {
  const all = await getOverview();
  const products = all.filter((p) => categorySlug(p.category) === slug);
  if (!products.length) return null;
  return { name: products[0].category, products, all };
}

export async function generateStaticParams() {
  const all = await getOverview();
  return [...new Set(all.map((p) => categorySlug(p.category)))].map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) return { title: "Categoria não encontrada" };
  const info = categoryInfo(data.name);
  const year = new Date().getFullYear();
  return {
    title: `${info.title} ${year}: histórico de preços`,
    description: `${data.products.length} produtos de ${data.name.toLowerCase()} com menor preço de hoje, histórico e veredito de desconto real.`,
    alternates: { canonical: `/categoria/${slug}` },
  };
}

export default async function CategoryPage({ params }: Params) {
  const { slug } = await params;
  const data = await load(slug);
  if (!data) notFound();
  const { name, products, all } = data;
  const info = categoryInfo(name);

  const series = await getDailySeries(products.map((p) => p.id), 30);
  const items: CatalogItem[] = products.map((p) => ({ product: p, verdict: verdictFor(p), series: series.get(p.id) || [] }));
  const drops = items
    .filter((i) => ["record", "below"].includes(i.verdict.kind))
    .sort((a, b) => (b.verdict.vsAvg ?? 0) - (a.verdict.vsAvg ?? 0))
    .slice(0, 3);
  const priced = products.filter((p) => p.best_price != null);
  const cheapest = priced.slice().sort((a, b) => Number(a.best_price) - Number(b.best_price))[0];
  const otherCats = [...new Set(all.map((p) => p.category))].filter((c) => c !== name);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: info.title,
    itemListElement: products.slice(0, 50).map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `/produto/${p.slug}`,
      name: p.name,
    })),
  };

  return (
    <div className="wrap category-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="crumbs" aria-label="Você está em">
        <Link href="/">Todos os produtos</Link> <span aria-hidden="true">/</span> {name}
      </nav>
      <header className="category-hero">
        <h1>{info.title}</h1>
        <p className="lede">{info.intro}</p>
        <p className="category-facts">
          {products.length} produtos acompanhados
          {cheapest ? (
            <>
              {" "}
              · a partir de <strong>{money(Number(cheapest.best_price))}</strong>
            </>
          ) : null}
          {drops.length ? <> · {drops.length === 1 ? "1 queda real hoje" : `${drops.length} quedas reais hoje`}</> : null}
        </p>
      </header>

      {drops.length ? (
        <section aria-labelledby="quedas" className="category-drops">
          <h2 id="quedas">Maiores quedas reais hoje</h2>
          <ul>
            {drops.map((d) => (
              <li key={d.product.id}>
                <Link href={`/produto/${d.product.slug}`}>{d.product.name}</Link>
                <span>
                  {money(Number(d.product.best_price))}
                  {d.verdict.vsAvg ? ` · ${Math.round(d.verdict.vsAvg * 100)}% abaixo da média de 30 dias` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <AdSlot id="categoria-topo" format="leaderboard" />

      <Catalog items={items} title={`${name}: todos os produtos`} showCategories={false} />

      {info.tips.length ? (
        <section aria-labelledby="dicas" className="page-text category-tips">
          <h2 id="dicas">Antes de comprar</h2>
          <ul>
            {info.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {otherCats.length ? (
        <nav className="category-others" aria-label="Outras categorias">
          <h2>Outras categorias</h2>
          <div className="chips">
            {otherCats.map((c) => (
              <Link key={c} href={`/categoria/${categorySlug(c)}`}>
                {c}
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      <AdSlot id="categoria-rodape" format="rodape" />
    </div>
  );
}
