import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicClient } from "@/lib/supabase";
import { getOverview } from "@/lib/data";
import { getCoupons, expiresLabel } from "@/lib/coupons";
import { verdictFor, isInflated } from "@/lib/verdict";
import { daysBetween, eventDeals, getPublicEvents, mentionsEvent, todayBR, type EventRow } from "@/lib/events";
import { money } from "@/lib/format";
import { CouponCard } from "@/components/CouponCard";
import { VerdictBadge } from "@/components/VerdictBadge";

export const revalidate = 900;

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string): Promise<EventRow | null> {
  const e = (await getPublicEvents()).find((x) => x.slug === slug) || null;
  return e && e.page ? e : null;
}

const fullDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const e = await load(slug);
  if (!e) return { title: "Data não encontrada" };
  const year = e.date.slice(0, 4);
  return {
    title: `${e.name} ${year}: quais descontos são de verdade`,
    description:
      e.intro ||
      `${e.name} ${year}: veja quais ofertas estão realmente abaixo da média dos últimos 30 dias e os cupons da data.`,
    alternates: { canonical: `/datas/${e.slug}` },
  };
}

function faq(e: EventRow) {
  const nome = `${e.article} ${e.name}`;
  const Nome = nome.charAt(0).toUpperCase() + nome.slice(1);
  return [
    {
      q: `Quando é ${nome} ${e.date.slice(0, 4)}?`,
      a: `${Nome} é em ${fullDate(e.date)}. Muitas lojas começam as ofertas na véspera e algumas estendem pelo fim de semana.`,
    },
    {
      q: `Os descontos d${e.article === "a" ? "a" : "o"} ${e.name} valem a pena?`,
      a: `Alguns sim. Muitas lojas sobem o preço "de" antes da data para o desconto parecer maior. Por isso comparamos o preço do dia com a média dos últimos 30 dias: se ficou abaixo, a queda é real.`,
    },
    {
      q: "Como saber se o desconto é de verdade?",
      a: "Olhe o histórico. Se o preço de hoje está abaixo da média de 30 dias e perto do menor preço já visto, é uma boa compra. Se o preço “de” nunca foi praticado, o desconto é menor do que parece.",
    },
    {
      q: "Os cupons funcionam em qualquer produto?",
      a: "Nem sempre. Cada cupom tem regras da loja (valor mínimo, produtos selecionados, primeira compra). Confira antes de finalizar a compra.",
    },
  ];
}

export default async function EventPage({ params }: Props) {
  const { slug } = await params;
  const e = await load(slug);
  if (!e) notFound();

  const today = todayBR();
  const days = daysBetween(today, e.date);
  const [products, coupons] = await Promise.all([getOverview(), getCoupons()]);
  const deals = days <= 0 ? await eventDeals(publicClient(), e, products) : [];
  const items = products.map((p) => ({ p, v: verdictFor(p) }));
  const inflated = items.filter((i) => isInflated(i.v.kind)).slice(0, 10);
  const eventCoupons = coupons.filter((c) => c.code && mentionsEvent(e, c.title, c.description, c.rules));
  const otherCoupons = eventCoupons.length < 6 ? coupons.filter((c) => c.code && !eventCoupons.includes(c)).slice(0, 6 - eventCoupons.length) : [];
  const realDrops = deals.filter((d) => d.pct >= 0.05).slice(0, 15);
  const watch = items
    .slice()
    .sort((a, b) => Number(Boolean(b.p.image_url)) - Number(Boolean(a.p.image_url)) || b.p.popularity - a.p.popularity)
    .slice(0, 15);
  const year = e.date.slice(0, 4);
  const qa = faq(e);
  const status =
    days > 1 ? `Faltam ${days} dias` : days === 1 ? "É amanhã" : days === 0 ? "É hoje" : `Foi em ${fullDate(e.date)}`;

  return (
    <article className="wrap event-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: qa.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })),
          }),
        }}
      />
      <header className="event-hero">
        <span className="event-when">
          {status} · {fullDate(e.date)}
        </span>
        <h1>
          {e.name} {year}: quais descontos são de verdade
        </h1>
        {e.intro ? <p>{e.intro}</p> : null}
      </header>

      {days <= 0 ? (
        <section className="event-section" aria-labelledby="reais">
          <h2 id="reais">{days === 0 ? "Descontos de verdade hoje" : `Descontos de verdade n${e.article === "a" ? "a" : "o"} ${e.name}`}</h2>
          <p className="lede">
            Menor preço do dia {days === 0 ? "de hoje" : "da data"} comparado com a média dos 30 dias anteriores. Só entram quedas de 5% ou mais.
          </p>
          {realDrops.length ? (
            <table className="event-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="num">Preço {days === 0 ? "hoje" : "na data"}</th>
                  <th className="num hide-sm">Média 30 dias</th>
                  <th className="num">Queda</th>
                </tr>
              </thead>
              <tbody>
                {realDrops.map((d) => (
                  <tr key={d.p.id}>
                    <td>
                      <Link href={`/produto/${d.p.slug}`} className="prod">
                        {d.p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.p.image_url} alt="" loading="lazy" />
                        ) : null}
                        <span>{d.p.name}</span>
                      </Link>
                    </td>
                    <td className="num">{money(d.price)}</td>
                    <td className="num hide-sm">{money(d.avg)}</td>
                    <td className="num event-good">−{Math.round(d.pct * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="empty">
              {days === 0
                ? "Ainda não apareceu nenhuma queda real hoje. A coleta roda às 9h e às 21h; volte mais tarde."
                : "Nenhum produto ficou 5% ou mais abaixo da média na data."}
            </p>
          )}
        </section>
      ) : (
        <section className="event-section" aria-labelledby="bater">
          <h2 id="bater">O preço para bater</h2>
          <p className="lede">
            Preço de hoje e o menor preço que já vimos. N{e.article === "a" ? "a" : "o"} {e.name}, desconto de verdade é o que fica
            abaixo da média de 30 dias, de preferência perto do menor preço já visto.
          </p>
          <table className="event-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="num">Hoje</th>
                <th className="num hide-sm">Média 30 dias</th>
                <th className="num">Menor já visto</th>
              </tr>
            </thead>
            <tbody>
              {watch.map(({ p }) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/produto/${p.slug}`} className="prod">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image_url} alt="" loading="lazy" />
                      ) : null}
                      <span>{p.name}</span>
                    </Link>
                  </td>
                  <td className="num">{money(Number(p.best_price))}</td>
                  <td className="num hide-sm">{p.avg_30d != null ? money(Number(p.avg_30d)) : "—"}</td>
                  <td className="num">{p.min_all != null ? money(Number(p.min_all)) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="event-section" aria-labelledby="cupons-data">
        <h2 id="cupons-data">Cupons {eventCoupons.length ? `d${e.article === "a" ? "a" : "o"} ${e.name}` : "em destaque"}</h2>
        {!eventCoupons.length ? (
          <p className="lede">Os cupons da data aparecem aqui assim que as lojas liberarem. Enquanto isso, os destaques de hoje:</p>
        ) : null}
        <div className="event-coupons">
          {[...eventCoupons.slice(0, 12), ...otherCoupons].map((c) => (
            <CouponCard key={c.id} c={c} expires={expiresLabel(c.expires_at)} />
          ))}
        </div>
        <p>
          <Link href="/cupons">Ver todos os cupons</Link>
        </p>
      </section>

      {inflated.length ? (
        <section className="event-section" aria-labelledby="cuidado">
          <h2 id="cuidado">Desconto menor do que parece</h2>
          <p className="lede">O preço “de” anunciado não apareceu nos últimos 30 dias e o preço de hoje está na média.</p>
          <ul className="event-list">
            {inflated.map(({ p, v }) => (
              <li key={p.id}>
                <Link href={`/produto/${p.slug}`}>{p.name}</Link>
                <VerdictBadge verdict={v} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="event-section" aria-labelledby="perguntas">
        <h2 id="perguntas">Perguntas frequentes</h2>
        <dl className="event-faq">
          {qa.map((x) => (
            <div key={x.q}>
              <dt>{x.q}</dt>
              <dd>{x.a}</dd>
            </div>
          ))}
        </dl>
      </section>

      <p className="note">
        Alguns links são de afiliado: se você comprar por eles, a loja nos paga uma comissão e o preço para você não muda.
      </p>
    </article>
  );
}
