import type { Metadata } from "next";
import Link from "next/link";
import { getOverview } from "@/lib/data";
import { verdictFor } from "@/lib/verdict";
import { getCoupons } from "@/lib/coupons";
import { categorySlug } from "@/lib/categories";
import { getSettings } from "@/lib/settings";
import { PriceTag } from "@/components/PriceTag";
import { VerdictBadge } from "@/components/VerdictBadge";

export const revalidate = 1800;

export const metadata: Metadata = {
  title: "Ofertas de hoje",
  description: "As maiores quedas reais de preço do dia e os cupons em destaque, atualizados duas vezes por dia.",
  alternates: { canonical: "/hoje" },
};

/**
 * Página do "link na bio": as ofertas do dia em cartões grandes, pensada para o celular.
 * Ordem: quedas reais (menor preço já visto, abaixo da média) e depois os mais buscados.
 */
export default async function Hoje() {
  const [products, coupons, s] = await Promise.all([getOverview(), getCoupons(), getSettings()]);
  const items = products.map((p) => ({ p, v: verdictFor(p) }));
  const real = items
    .filter((i) => ["record", "below"].includes(i.v.kind))
    .sort((a, b) => (b.v.vsAvg ?? 0) - (a.v.vsAvg ?? 0));
  const rest = items
    .filter((i) => !real.includes(i) && i.v.kind !== "fake")
    .sort((a, b) => Number(Boolean(b.p.image_url)) - Number(Boolean(a.p.image_url)) || b.p.popularity - a.p.popularity);
  const list = [...real, ...rest].slice(0, 12);
  const topCoupons = coupons.filter((c) => c.code).slice(0, 4);
  const categories = [...new Set(products.map((p) => p.category))];
  const updated = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="wrap today-page">
      <header className="today-head">
        <h1>Ofertas de hoje</h1>
        <p>
          {real.length
            ? `${real.length} ${real.length === 1 ? "produto está" : "produtos estão"} abaixo da média de 30 dias agora.`
            : "Os mais buscados com o menor preço de hoje."}{" "}
          <span className="muted">Atualizado em {updated}.</span>
        </p>
        <nav className="today-quick" aria-label="Atalhos">
          <Link href="/cupons">🎟️ Cupons</Link>
          <Link href="/">🔎 Todos os produtos</Link>
          {s.contact.instagram ? (
            <a href={`https://www.instagram.com/${s.contact.instagram}/`} rel="noopener">
              📸 Instagram
            </a>
          ) : null}
          {s.contact.tiktok ? (
            <a href={`https://www.tiktok.com/@${s.contact.tiktok}`} rel="noopener">
              🎵 TikTok
            </a>
          ) : null}
        </nav>
      </header>

      <ol className="today-list">
        {list.map(({ p, v }, i) => (
          <li key={p.id}>
            <Link href={`/produto/${p.slug}`} className="today-card">
              <span className="today-rank">{i + 1}</span>
              <span className="today-img">
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" loading={i < 3 ? "eager" : "lazy"} />
                ) : null}
              </span>
              <span className="today-info">
                <span className="today-name">{p.name}</span>
                <PriceTag
                  price={Number(p.best_price)}
                  listPrice={p.best_list_price != null ? Number(p.best_list_price) : null}
                  store={p.best_store}
                />
                <VerdictBadge verdict={v} />
              </span>
            </Link>
          </li>
        ))}
      </ol>

      {topCoupons.length ? (
        <section className="today-coupons" aria-labelledby="cupons-hoje">
          <h2 id="cupons-hoje">Cupons em destaque</h2>
          <ul>
            {topCoupons.map((c) => (
              <li key={c.id}>
                <span>
                  <strong>{c.store}</strong> · {c.title}
                </span>
                <code>{c.code}</code>
              </li>
            ))}
          </ul>
          <Link href="/cupons" className="btn">
            Ver todos os cupons
          </Link>
        </section>
      ) : null}

      <nav className="category-links" aria-label="Categorias">
        {categories.map((c) => (
          <Link key={c} href={`/categoria/${categorySlug(c)}`}>
            {c}
          </Link>
        ))}
      </nav>

      <p className="note">
        Alguns links são de afiliado: se você comprar por eles, a loja nos paga uma comissão e o preço para você não muda.
      </p>
    </div>
  );
}
