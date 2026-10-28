import Link from "next/link";
import { getDailySeries, getOverview } from "@/lib/data";
import { verdictFor } from "@/lib/verdict";
import { Catalog, type CatalogItem } from "@/components/Catalog";
import { PriceTag } from "@/components/PriceTag";
import { VerdictBadge } from "@/components/VerdictBadge";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 3600;

export default async function Home() {
  const products = await getOverview();
  const series = await getDailySeries(products.map((p) => p.id), 30);

  const items: CatalogItem[] = products.map((p) => ({
    product: p,
    verdict: verdictFor(p),
    series: series.get(p.id) || [],
  }));

  const stores = new Set(products.map((p) => p.best_store).filter(Boolean)).size;

  // Destaque: maior queda real (vs média de 30 dias). Sem histórico ainda, o mais buscado com preço.
  const real = items
    .filter((i) => ["record", "below"].includes(i.verdict.kind))
    .sort((a, b) => (b.verdict.vsAvg ?? 0) - (a.verdict.vsAvg ?? 0));
  const featured = real[0] || items.find((i) => i.product.best_price != null) || null;
  const fakes = items.filter((i) => i.verdict.kind === "fake").length;

  return (
    <>
      <section className="hero">
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <h1>Antes de comprar, veja quanto custava ontem.</h1>
            <p className="lede">
              Acompanhamos {products.length || "os"} produtos mais buscados da Black Friday em várias lojas, duas
              vezes por dia. Quando o desconto é de verdade, você vê no gráfico. Quando é o velho “metade do dobro”,
              também.
            </p>
            {fakes > 0 ? (
              <p className="hero-alert">
                Hoje {fakes === 1 ? "1 oferta tem" : `${fakes} ofertas têm`} preço “de” inflado.
              </p>
            ) : null}
          </div>

          {featured && featured.product.best_price != null ? (
            <Link href={`/produto/${featured.product.slug}`} className="hero-deal">
              <span className="hero-deal-kicker">
                {real[0] ? "Maior queda real de hoje" : "O mais buscado agora"}
              </span>
              <span className="hero-deal-name">{featured.product.name}</span>
              <PriceTag
                price={Number(featured.product.best_price)}
                store={featured.product.best_store}
                size="lg"
              />
              <VerdictBadge verdict={featured.verdict} withDetail />
            </Link>
          ) : (
            <div className="hero-deal hero-deal-empty">
              <span className="hero-deal-name">A primeira coleta ainda não rodou.</span>
              <p>Rode “npm run collect” ou dispare a ação “Coleta de preços” no GitHub para preencher o site.</p>
            </div>
          )}
        </div>
      </section>

      <div className="wrap">
        <AdSlot id="home-topo" format="leaderboard" />
        {items.length ? (
          <Catalog items={items} />
        ) : (
          <p className="empty">Nenhum produto cadastrado. Rode “npm run seed” para cadastrar a lista inicial.</p>
        )}
        {stores > 0 ? <p className="note">Preços de {stores} lojas diferentes no momento.</p> : null}
        <AdSlot id="home-rodape" format="rodape" />
      </div>
    </>
  );
}
