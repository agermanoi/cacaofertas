import type { Metadata } from "next";
import Link from "next/link";
import { getOverview } from "@/lib/data";
import { guideItems, liveGuides } from "@/lib/guides";
import { breadcrumbLd } from "@/lib/seo";
import { money } from "@/lib/format";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Guias de preço: o mais barato de hoje por tipo de produto",
  description: "Celular até R$ 1.500, iPhone mais barato, smart TV, notebook, videogame e mais: o menor preço de hoje comparado com a média recente.",
  alternates: { canonical: "/precos" },
};

export default async function GuidesIndex() {
  const all = await getOverview();
  const guides = liveGuides(all);
  return (
    <div className="wrap page-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd([{ name: "Início", path: "/" }, { name: "Guias de preço", path: "/precos" }])) }}
      />
      <nav className="crumbs" aria-label="Você está em">
        <Link href="/">Início</Link> <span aria-hidden="true">/</span> Guias de preço
      </nav>
      <h1>Guias de preço</h1>
      <p className="lede">O mais barato de hoje por tipo de produto e faixa de preço, comparado com a média recente de cada um.</p>
      <ul className="guide-list">
        {guides.map(({ guide, count }) => {
          const first = guideItems(guide, all)[0];
          return (
            <li key={guide.slug}>
              <Link href={`/precos/${guide.slug}`}>{guide.title}</Link>
              <span className="muted">
                {" "}
                · {count} opções a partir de {money(Number(first.best_price))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
