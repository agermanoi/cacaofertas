import type { Metadata } from "next";
import Link from "next/link";
import { getOverview } from "@/lib/data";
import { isInflated, verdictFor } from "@/lib/verdict";
import { expiresLabel, getCoupons, type Coupon } from "@/lib/coupons";
import { adminClient } from "@/lib/supabase";
import { CouponCard } from "@/components/CouponCard";
import type { ProductOverview } from "@/lib/types";
import { categorySlug } from "@/lib/categories";
import { getSettings } from "@/lib/settings";
import { PriceTag } from "@/components/PriceTag";
import { VerdictBadge } from "@/components/VerdictBadge";

export const revalidate = 600;

export const metadata: Metadata = {
  title: "Ofertas de hoje",
  description: "As maiores quedas reais de preço do dia e os cupons em destaque, atualizados duas vezes por dia.",
  alternates: { canonical: "/hoje" },
};

/** Posts publicados nas redes nos últimos 3 dias, do mais novo para o mais antigo. */
async function recentPosts(): Promise<{ kind: string; slug: string; coupon_id: string | null; published_at: string }[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  try {
    const { data } = await adminClient()
      .from("social_posts")
      .select("kind,slug,coupon_id,published_at")
      .eq("status", "published")
      .gte("published_at", new Date(Date.now() - 3 * 86_400_000).toISOString())
      .order("published_at", { ascending: false })
      .limit(30);
    return data || [];
  } catch {
    return [];
  }
}

/**
 * Página do "link na bio": primeiro o que acabou de sair no Instagram e no Facebook
 * (na mesma ordem dos posts, o mais novo em cima), depois as outras ofertas do dia.
 */
export default async function Hoje() {
  const [products, coupons, s, posts] = await Promise.all([getOverview(), getCoupons(), getSettings(), recentPosts()]);
  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const byCoupon = new Map(coupons.map((c) => [c.id, c]));

  // o que saiu nas redes (sem repetir; some se o produto ficou sem preço ou o cupom venceu)
  const seen = new Set<string>();
  const posted: ({ type: "product"; p: ProductOverview; at: string } | { type: "coupon"; c: Coupon; at: string })[] = [];
  for (const post of posts) {
    const key = post.kind === "coupon" ? `c:${post.coupon_id}` : `p:${post.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (post.kind === "coupon") {
      const c = post.coupon_id ? byCoupon.get(post.coupon_id) : undefined;
      if (c) posted.push({ type: "coupon", c, at: post.published_at });
    } else {
      const p = bySlug.get(post.slug);
      if (p) posted.push({ type: "product", p, at: post.published_at });
    }
    if (posted.length >= 10) break;
  }
  const postedSlugs = new Set(posted.flatMap((x) => (x.type === "product" ? [x.p.slug] : [])));
  const postedCoupons = new Set(posted.flatMap((x) => (x.type === "coupon" ? [x.c.id] : [])));

  const items = products.filter((p) => !postedSlugs.has(p.slug)).map((p) => ({ p, v: verdictFor(p) }));
  const real = items
    .filter((i) => ["record", "below"].includes(i.v.kind))
    .sort((a, b) => (b.v.vsAvg ?? 0) - (a.v.vsAvg ?? 0));
  const rest = items
    .filter((i) => !real.includes(i) && !isInflated(i.v.kind))
    .sort((a, b) => Number(Boolean(b.p.image_url)) - Number(Boolean(a.p.image_url)) || b.p.popularity - a.p.popularity);
  const list = [...real, ...rest].slice(0, 12);
  const topCoupons = coupons.filter((c) => c.code && !postedCoupons.has(c.id)).slice(0, 4);
  const categories = [...new Set(products.map((p) => p.category))];
  const at = (iso: string) => {
    const d = new Date(iso);
    const sameDay =
      d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) === new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const hm = d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
    return sameDay ? `hoje, ${hm}` : `${d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" })}, ${hm}`;
  };
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

      {posted.length ? (
        <section className="today-posted" aria-labelledby="nas-redes">
          <h2 id="nas-redes">Acabou de sair no Instagram</h2>
          <ol className="today-list">
            {posted.map((x) =>
              x.type === "product" ? (
                <li key={`p-${x.p.id}`}>
                  <Link href={`/produto/${x.p.slug}`} className="today-card">
                    <span className="today-rank today-new">●</span>
                    <span className="today-img">
                      {x.p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={x.p.image_url} alt="" loading="eager" />
                      ) : null}
                    </span>
                    <span className="today-info">
                      <span className="today-when">Postado {at(x.at)}</span>
                      <span className="today-name">{x.p.name}</span>
                      <PriceTag
                        price={Number(x.p.best_price)}
                        listPrice={x.p.best_list_price != null ? Number(x.p.best_list_price) : null}
                        store={x.p.best_store}
                      />
                      <VerdictBadge verdict={verdictFor(x.p)} />
                    </span>
                  </Link>
                </li>
              ) : (
                <li key={`c-${x.c.id}`} className="today-coupon-item">
                  <span className="today-when">Postado {at(x.at)}</span>
                  <CouponCard c={x.c} expires={expiresLabel(x.c.expires_at)} />
                </li>
              )
            )}
          </ol>
        </section>
      ) : null}

      {posted.length ? <h2 className="today-more">Mais ofertas de hoje</h2> : null}
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
