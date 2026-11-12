import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { breadcrumbLd, faqLd, productFaq } from "@/lib/seo";
import { GUIDES, MIN_ITEMS, guideItems } from "@/lib/guides";
import { categorySlug as catSlugForCrumb } from "@/lib/categories";
import { siteUrl } from "@/lib/site";
import { formatSeen, getDailySeries, getOffers, getOverview, getProductBySlug, getStoreSeries } from "@/lib/data";
import { periodLabel, verdictFor } from "@/lib/verdict";
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
import { productAnalysis } from "@/lib/analysis";
import { PriceAlert } from "@/components/PriceAlert";
import { storeSlug } from "@/lib/stores";
import { categorySlug } from "@/lib/categories";
import { imgProps } from "@/lib/img";
import { getSettings } from "@/lib/settings";
import { TelegramCta } from "@/components/TelegramCta";

export const revalidate = 3600;

type Params = { params: Promise<{ slug: string }> };

/** "visto hoje, 03:18", "visto ontem, 21:40", "visto há 2 dias" (horário de Brasília). */
function seenLabel(iso: string): string {
  const tz = "America/Sao_Paulo";
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  const hm = d.toLocaleTimeString("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const today = day(new Date());
  const yesterday = day(new Date(Date.now() - 86_400_000));
  if (day(d) === today) return `visto hoje, ${hm}`;
  if (day(d) === yesterday) return `visto ontem, ${hm}`;
  const n = Math.round((Date.parse(today) - Date.parse(day(d))) / 86_400_000);
  return `visto há ${n} dias`;
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p || !p.active) return { title: "Produto não encontrado" };
  // Sem oferta no momento: a página continua acessível, mas fora do Google até voltar
  // ou com histórico curto demais para ter análise (entra no Google quando tiver dados)
  const noIndex = p.best_price == null || Number(p.days_tracked || 0) < 5 ? { robots: { index: false, follow: true } } : {};
  const price = p.best_price != null ? ` por ${money(Number(p.best_price))}` : "";
  const sp = getSpecs(p.slug, p.specs);
  return {
    title: `${p.name}: menor preço hoje, histórico e ficha técnica`,
    description: `${p.name}${price}. Histórico de preço, média dos últimos 30 dias e ficha técnica.${sp ? ` ${sp.summary}` : ""}`.slice(0, 300),
    alternates: { canonical: `/produto/${p.slug}` },
    ...noIndex,
  };
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p || !p.active) notFound(); // pausado no /admin = fora do site
  if (p.best_price == null && p.min_all == null) notFound(); // nunca teve preço: ainda não entra no site

  const [series, stores, offers, settings] = await Promise.all([
    getDailySeries([p.id], 90),
    getStoreSeries(p.id, 90),
    getOffers(p.id),
    getSettings(),
  ]);
  const best = series.get(p.id) || [];
  const coupons = await getCouponsForStores([...new Set(offers.map((o) => o.store))], p.id);
  const productCoupons = coupons.filter((c) => c.product_id === p.id);
  const verdict = verdictFor(p);
  const specs = getSpecs(p.slug, p.specs);
  const overview = await getOverview();
  const guides = GUIDES.filter((g) => g.match(p) && guideItems(g, overview).length >= MIN_ITEMS);
  const analysis = productAnalysis(p, verdict, best, stores, offers);
  const faq = productFaq(p, verdict, { stores: offers.length, seen: offers[0]?.last_seen_at ? formatSeen(offers[0].last_seen_at) : null });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${siteUrl()}/produto/${p.slug}#produto`,
    url: `${siteUrl()}/produto/${p.slug}`,
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
            url: `${siteUrl()}/produto/${p.slug}`,
          }
        : undefined,
  };

  return (
    <article className="wrap product">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            breadcrumbLd([
              { name: "Início", path: "/" },
              { name: p.category, path: `/categoria/${catSlugForCrumb(p.category)}` },
              { name: p.name, path: `/produto/${p.slug}` },
            ])
          ),
        }}
      />

      {faq.length ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd(faq)) }} /> : null}

      <nav className="crumbs" aria-label="Você está em">
        <Link href="/">Todos os produtos</Link> <span aria-hidden="true">/</span>{" "}
        <Link href={`/categoria/${categorySlug(p.category)}`}>{p.category}</Link>
      </nav>

      <header className="product-head">
        <div className="product-id">
          {p.image_url ? <img {...imgProps(p.image_url, 96)} alt="" className="product-img" width={96} height={96} fetchPriority="high" /> : null}
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
          <dt>Média dos últimos {periodLabel(p.days_tracked)}</dt>
          <dd>{money(p.avg_30d)}</dd>
        </div>
        <div>
          <dt>Maior preço em {periodLabel(p.days_tracked)}</dt>
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

      {analysis.length ? (
        <section aria-labelledby="analise" className="analysis">
          <h2 id="analise">O que o histórico mostra</h2>
          {analysis.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
          <p className="note">
            Texto gerado a partir das leituras de preço do Caça Ofertas. <Link href="/como-funciona">Veja como medimos</Link>
            {storeSlug(p.best_store) ? (
              <>
                {" "}
                ou <Link href={`/loja/${storeSlug(p.best_store)}`}>quando {p.best_store} costuma ser a mais barata</Link>
              </>
            ) : null}
            .
          </p>
        </section>
      ) : null}

      {p.best_price != null ? <PriceAlert productId={p.id} price={Number(p.best_price)} /> : null}
      <TelegramCta channel={settings.contact.telegram} whatsapp={settings.contact.whatsappChannel} compact />

      <section aria-labelledby="ofertas">
        <h2 id="ofertas">Onde comprar agora</h2>
        {productCoupons.slice(0, 2).map((c) => (
          <a key={c.id} className="product-coupon" href={`/c/${c.id}`} rel="nofollow sponsored noopener" target="_blank">
            <span aria-hidden="true">🎟️</span>
            <span>
              <strong>
                Cupom {c.store === "Mercado Livre" ? "no" : "na"} {c.store}
                {c.discount ? `: ${c.discount}` : ""}
              </strong>
              <small>{c.code ? `Use o código ${c.code}` : "O desconto ativa pelo link"}{c.expires_at ? ` · ${expiresLabel(c.expires_at)}` : ""}</small>
            </span>
            <span className="product-coupon-cta">Ativar ›</span>
          </a>
        ))}
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
                    <span className="seen">{seenLabel(o.last_seen_at)}</span>
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
          <p className="empty">Nenhuma loja com este produto em estoque nos últimos dias.</p>
        )}
        <p className="note">
          Preço à vista visto na última leitura de cada loja (horário ao lado do preço). As lojas mudam preços ao longo do dia;
          confira o valor final, o frete e o parcelamento na loja.
        </p>
      </section>

      {coupons.length ? (
        <section aria-labelledby="cupons">
          <h2 id="cupons">{productCoupons.length ? "Cupons para este produto" : "Cupons das lojas deste produto"}</h2>
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

      {guides.length ? (
        <nav className="category-others" aria-label="Compare com outros">
          <h2>Compare com outros</h2>
          <div className="chips">
            {guides.map((g) => (
              <Link key={g.slug} href={`/precos/${g.slug}`}>
                {g.title} hoje
              </Link>
            ))}
          </div>
        </nav>
      ) : null}

      {faq.length ? (
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
      ) : null}

      {specs ? <SpecSheet specs={specs} /> : null}

      <AdSlot id="produto-rodape" format="retangulo" />
    </article>
  );
}
