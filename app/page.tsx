import Link from "next/link";
import { getDailySeries, getOverview } from "@/lib/data";
import { verdictFor } from "@/lib/verdict";
import { Catalog, type CatalogItem } from "@/components/Catalog";
import { HeroCarousel, type HeroSlide } from "@/components/HeroCarousel";
import { AdSlot } from "@/components/AdSlot";
import { getSettings } from "@/lib/settings";
import { categorySlug } from "@/lib/categories";

export const revalidate = 3600;

export default async function Home() {
  const [products, settings] = await Promise.all([getOverview(), getSettings()]);
  const series = await getDailySeries(products.map((p) => p.id), 30);

  const items: CatalogItem[] = products.map((p) => ({
    product: p,
    verdict: verdictFor(p),
    series: series.get(p.id) || [],
  }));

  const stores = new Set(products.map((p) => p.best_store).filter(Boolean)).size;

  // Carrossel: maiores quedas reais primeiro; depois os mais buscados com foto. Até 6 produtos.
  const real = items
    .filter((i) => ["record", "below"].includes(i.verdict.kind))
    .sort((a, b) => (b.verdict.vsAvg ?? 0) - (a.verdict.vsAvg ?? 0));
  const popular = items
    .filter((i) => i.product.best_price != null && !real.includes(i))
    .sort((a, b) => Number(Boolean(b.product.image_url)) - Number(Boolean(a.product.image_url)) || b.product.popularity - a.product.popularity);
  const slides: HeroSlide[] = [...real.slice(0, 4), ...popular]
    .slice(0, 6)
    .map((i) => ({
      slug: i.product.slug,
      name: i.product.name,
      image: i.product.image_url,
      price: Number(i.product.best_price),
      listPrice: i.product.best_list_price != null ? Number(i.product.best_list_price) : null,
      store: i.product.best_store,
      kicker: real.includes(i) ? "Queda real hoje" : "Entre os mais buscados",
      verdict: i.verdict,
    }));
  const fakes = items.filter((i) => i.verdict.kind === "fake").length;

  return (
    <>
      <section className="hero">
        <div className="wrap hero-inner">
          <div className="hero-copy">
            <h1>{settings.heroTitle}</h1>
            <p className="lede">
              {settings.heroText.replace("{n}", products.length ? String(products.length) : "os")}
            </p>
            {fakes > 0 ? (
              <p className="hero-alert">
                Hoje {fakes === 1 ? "1 oferta tem" : `${fakes} ofertas têm`} preço “de” inflado.
              </p>
            ) : null}
          </div>

          {slides.length ? (
            <HeroCarousel slides={slides} />
          ) : (
            <div className="hero-deal hero-deal-empty">
              <span className="hero-deal-name">A primeira coleta ainda não rodou.</span>
              <p>Dispare a ação “Coleta de preços” no GitHub ou use “Coletar agora” no painel.</p>
            </div>
          )}
        </div>
      </section>

      <div className="wrap">
        {products.length ? (
          <nav className="category-links" aria-label="Categorias">
            {[...new Set(products.map((p) => p.category))].map((c) => (
              <Link key={c} href={`/categoria/${categorySlug(c)}`}>
                {c} <span>{products.filter((p) => p.category === c).length}</span>
              </Link>
            ))}
          </nav>
        ) : null}
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
