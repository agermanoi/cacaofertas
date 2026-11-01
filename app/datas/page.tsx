import type { Metadata } from "next";
import Link from "next/link";
import { daysBetween, getPublicEvents, todayBR } from "@/lib/events";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Calendário de promoções do varejo",
  description: "As datas de promoção do varejo brasileiro (11.11, Black Friday, 12.12, Dia do Consumidor…) e quais descontos são de verdade em cada uma.",
  alternates: { canonical: "/datas" },
};

const fullDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" });

export default async function Datas() {
  const events = (await getPublicEvents()).filter((e) => e.page);
  const today = todayBR();
  return (
    <article className="wrap event-page">
      <header className="event-hero">
        <h1>Calendário de promoções</h1>
        <p>
          As datas em que o varejo brasileiro faz promoção. Em cada uma, comparamos o preço do dia com a média dos últimos 30
          dias para mostrar quais descontos são de verdade.
        </p>
      </header>
      {events.length ? (
        <ul className="event-list">
          {events.map((e) => {
            const days = daysBetween(today, e.date);
            return (
              <li key={e.id}>
                <span>
                  <Link href={`/datas/${e.slug}`}>
                    <strong>{e.name}</strong>
                  </Link>{" "}
                  · {fullDate(e.date)}
                </span>
                <span className="muted">{days > 1 ? `em ${days} dias` : days === 1 ? "amanhã" : days === 0 ? "hoje" : "passou"}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="empty">Nenhuma data cadastrada.</p>
      )}
    </article>
  );
}
