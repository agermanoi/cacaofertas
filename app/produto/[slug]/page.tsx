import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDailySeries, getOffers, getProductBySlug, getStoreSeries } from "@/lib/data";
import { verdictFor } from "@/lib/verdict";
import { money } from "@/lib/format";
import { PriceTag } from "@/components/PriceTag";
import { VerdictBadge } from "@/components/VerdictBadge";
import { PriceChart } from "@/components/PriceChart";
import { AdSlot } from "@/components/AdSlot";
import { SpecSheet } from "@/components/SpecSheet";
import { StoreLink } from "@/components/StoreLink";
import { CouponCard } from "@/components/CouponCard";
import { expiresLabel, getCouponsForStores } from "@/lib/coupons";
import { getSpecs } from "@/lib/specs";

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p || !p.active) return { title: "Produto não encontrado" };
  const price = p.best_price != null ? ` por ${money(Number(p.best_price))}` : "";
  const sp = getSpecs(p.slug, p.specs);
  return {
    title: `${p.name}: histórico de preço e ficha técnica`,
    description: `${p.name}${price}. Histórico de preço, média dos últimos 30 dias e ficha técnica.${sp ? ` ${sp.summary}` : ""}`.slice(0, 300),
    alternates: { canonical: `/produto/${p.slug}` },
    openGraph: { images: p.image_url ? [p.image_url] : [] },
  };
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p || !p.active) notFound(); // pausado no /admin = fora do site

  const [series, stores, offers] = await Promise.all([
    getDailySeries([p.id], 90),
    getStoreSeries(p.id, 90),
    getOffers(p.id),
  ]);
  const best = series.get(p.id) || [];
  const coupons = await getCouponsForStores([...new Set(offers.map((o) => o.store))]);
  const verdict = verdictFor(p);
  const specs = getSpecs(p.slug, p.specs);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    image: p.image_url || undefined,
    category: p.category,
    description: specs?.summary,
    additionalProperty: specs?.specs.map(([name, value]) => ({ "@type": "PropertyValue", name, value })),
    offers:
      offers.length > 0
        ? {
            "@type": "AggregateOffer",
            priceCurrency: "BRL",
            lowPrice: Number(offers[0].last_price),
            highPrice: Number(offers[offers.length - 1].last_price),
            offerCount: offers.length,
          }
        : undefined,
  };

  return (
    <article className="wrap product">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <nav className="crumbs" aria-label="Você está em">
        <Link href="/">Todos os produtos</Link> <span aria-hidden="true">/</span> {p.category}
      </nav>

      <header className="product-head">
        <div className="product-id">
          {p.image_url ? <img src={p.image_url} alt="" className="product-img" /> : null}
          <h1>{p.name}</h1>
        </div>
        <div className="product-price">
          {p.best_price != null ? (
            <PriceTag price={Number(p.best_price)} listPrice={p.best_list_price} store={p.best_store} size="lg" />
          ) : null}
          <VerdictBadge verdict={verdict} withDetail />
        </div>
      </header>

      <dl className="stats">
        <div>
          <dt>Menor preço já visto</dt>
          <dd>{money(p.min_all)}</dd>
        </div>
        <div>
          <dt>Média dos últimos 30 dias</dt>
          <dd>{money(p.avg_30d)}</dd>
        </div>
        <div>
          <dt>Maior preço em 30 dias</dt>
          <dd>{money(p.max_30d)}</dd>
        </div>
        <div>
          <dt>Dias acompanhados</dt>
          <dd>{p.days_tracked ?? 0}</dd>
        </div>
      </dl>

      <AdSlot id="produto-topo" format="leaderboard" />

      <section aria-labelledby="hist">
        <h2 id="hist">Histórico de preço</h2>
        <PriceChart best={best} stores={stores} />
      </section>

      <section aria-labelledby="ofertas">
        <h2 id="ofertas">Onde comprar agora</h2>
        {offers.length ? (
          <table className="offers">
            <thead>
              <tr>
                <th scope="col">Loja</th>
                <th scope="col">Anúncio</th>
                <th scope="col" className="num">
                  Preço
                </th>
                <th scope="col">
                  <span className="sr-only">Ação</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {offers.map((o, i) => (
                <tr key={o.id} className={i === 0 ? "best" : undefined}>
                  <td className="store">{o.store}</td>
                  <td className="title">{o.title}</td>
                  <td className="num">
                    {o.last_list_price && Number(o.last_list_price) > Number(o.last_price) ? (
                      <s>{money(o.last_list_price)}</s>
                    ) : null}
                    <strong>{money(o.last_price)}</strong>
                  </td>
                  <td>
                    <StoreLink href={`/go/${o.id}`} className="btn">
                      Ver na loja
                    </StoreLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="empty">Nenhuma loja com este produto em estoque nos últimos 3 dias.</p>
        )}
        <p className="note">
          Preço à vista visto na última coleta. Frete, cupons e parcelamento podem mudar o valor final.
        </p>
      </section>

      {coupons.length ? (
        <section aria-labelledby="cupons">
          <h2 id="cupons">Cupons das lojas deste produto</h2>
          <div className="coupon-grid">
            {coupons.slice(0, 6).map((c) => (
              <CouponCard key={c.id} c={c} expires={expiresLabel(c.expires_at)} />
            ))}
          </div>
          <p className="note">
            Confira as regras: muitos cupons valem só para algumas categorias ou acima de um valor mínimo.{" "}
            <Link href="/cupons">Ver todos os cupons</Link>
          </p>
        </section>
      ) : null}

      {specs ? <SpecSheet specs={specs} /> : null}

      <AdSlot id="produto-rodape" format="retangulo" />
    </article>
  );
}
