import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { STORES, getStoreReport, storeBySlug, storeTexts } from "@/lib/stores";
import { breadcrumbLd, faqLd } from "@/lib/seo";
import { money } from "@/lib/format";

export const revalidate = 3600;

export function generateStaticParams() {
  return STORES.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = storeBySlug((await params).slug);
  if (!s) return {};
  return {
    title: `${s.name} é mais barat${s.art === "a" ? "a" : "o"}? Comparação de preços com outras lojas`,
    description: `Quantas vezes ${s.art} ${s.name} teve o menor preço nos últimos 14 dias, comparação direta com outras lojas e os produtos em que ela está mais barata hoje.`,
    alternates: { canonical: `/loja/${s.slug}` },
  };
}

export default async function StorePage({ params }: Props) {
  const s = storeBySlug((await params).slug);
  if (!s) notFound();
  const r = await getStoreReport(s.name);
  const texts = r ? storeTexts(s, r) : { paras: [], faq: [] };
  const da = s.art === "a" ? "da" : "do";

  return (
    <div className="wrap page-text store-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(breadcrumbLd([{ name: "Início", path: "/" }, { name: "Lojas", path: "/lojas" }, { name: s.name, path: `/loja/${s.slug}` }])),
        }}
      />
      {texts.faq.length ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd(texts.faq)) }} /> : null}
      <nav className="crumbs" aria-label="Você está em">
        <Link href="/">Início</Link> <span aria-hidden="true">/</span> <Link href="/lojas">Lojas</Link> <span aria-hidden="true">/</span> {s.name}
      </nav>
      <h1>
        Preços {da} {s.name}: quando {s.art === "a" ? "ela" : "ele"} é {s.art === "a" ? "a mais barata" : "o mais barato"}
      </h1>

      {!r ? (
        <p>Não foi possível carregar a comparação agora. Tente de novo em alguns minutos.</p>
      ) : (
        <>
          <div className="store-stats">
            <div><strong>{r.products}</strong><span>produtos acompanhados</span></div>
            <div><strong>{r.compared ? `${Math.round((r.wins / r.compared) * 100)}%` : "–"}</strong><span>das comparações com o menor preço ({r.days} dias)</span></div>
            <div><strong>{r.cheapest.length}</strong><span>produtos em que {s.art === "a" ? "está a mais barata" : "está o mais barato"} hoje</span></div>
          </div>

          <section aria-labelledby="resumo">
            <h2 id="resumo">O que os números mostram</h2>
            {texts.paras.map((t, i) => <p key={i}>{t}</p>)}
          </section>

          {r.rivals.length ? (
            <section aria-labelledby="duelos">
              <h2 id="duelos">{s.name} contra outras lojas</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Loja</th><th>Comparações</th><th>{s.name} mais barat{s.art === "a" ? "a" : "o"}</th><th>Outra loja mais barata</th><th>Diferença típica</th></tr>
                  </thead>
                  <tbody>
                    {r.rivals.map((rv) => {
                      const med = rv.median_diff == null ? null : Number(rv.median_diff);
                      return (
                        <tr key={rv.rival}>
                          <td>{rv.rival}</td>
                          <td className="num">{rv.n}</td>
                          <td className="num">{rv.cheaper} ({Math.round((rv.cheaper / rv.n) * 100)}%)</td>
                          <td className="num">{rv.n - rv.cheaper - rv.tie}</td>
                          <td className="num">
                            {med == null || Math.abs(med) < 0.005 ? "empate" : med > 0 ? `${rv.rival} ${Math.round(med * 100)}% mais cara` : `${s.name} ${Math.round(-med * 100)}% mais cara`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="hint">Comparações = dias em que o mesmo produto tinha preço nas duas lojas. Lojas com poucas comparações têm resultado menos confiável.</p>
            </section>
          ) : null}

          {r.cheapest.length ? (
            <section aria-labelledby="hoje">
              <h2 id="hoje">Onde {s.art} {s.name} está mais barat{s.art === "a" ? "a" : "o"} hoje</h2>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Produto</th><th>Preço {da} {s.name}</th><th>Próxima loja</th><th>Economia</th></tr></thead>
                  <tbody>
                    {r.cheapest.map((p) => (
                      <tr key={p.slug}>
                        <td><Link href={`/produto/${p.slug}`}>{p.name}</Link></td>
                        <td className="num">{money(Number(p.price))}</td>
                        <td>{p.next_store ? `${p.next_store} · ${money(Number(p.next_price))}` : "só nesta loja"}</td>
                        <td className="num">{p.gap != null && Number(p.gap) >= 0.005 ? `${Math.round(Number(p.gap) * 100)}%` : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="hint">Preços da última leitura. Podem mudar a qualquer momento: confira na loja antes de comprar.</p>
            </section>
          ) : null}

          {texts.faq.length ? (
            <section aria-labelledby="perguntas" className="faq">
              <h2 id="perguntas">Perguntas frequentes</h2>
              <dl>
                {texts.faq.map((f) => (
                  <div key={f.q}><dt>{f.q}</dt><dd>{f.a}</dd></div>
                ))}
              </dl>
            </section>
          ) : null}
        </>
      )}
      <p>
        Veja também: {STORES.filter((x) => x.slug !== s.slug).map((x, i) => (
          <span key={x.slug}>{i ? ", " : ""}<Link href={`/loja/${x.slug}`}>preços {x.art === "a" ? "da" : "do"} {x.name}</Link></span>
        ))}{" "}
        e <Link href="/precos">guias de preço</Link>.
      </p>
    </div>
  );
}
