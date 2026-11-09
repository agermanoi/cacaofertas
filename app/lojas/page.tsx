import type { Metadata } from "next";
import Link from "next/link";
import { STORES, getStoreReport } from "@/lib/stores";
import { breadcrumbLd } from "@/lib/seo";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Qual loja é mais barata? Amazon x Mercado Livre e outras",
  description: "Quantas vezes cada loja teve o menor preço nos últimos 14 dias, com comparação direta entre as lojas, a partir do histórico do Caça Ofertas.",
  alternates: { canonical: "/lojas" },
};

export default async function Lojas() {
  const reports = await Promise.all(STORES.map(async (s) => ({ s, r: await getStoreReport(s.name) })));
  return (
    <div className="wrap page-text">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd([{ name: "Início", path: "/" }, { name: "Lojas", path: "/lojas" }])) }}
      />
      <nav className="crumbs" aria-label="Você está em">
        <Link href="/">Início</Link> <span aria-hidden="true">/</span> Lojas
      </nav>
      <h1>Qual loja é mais barata?</h1>
      <p className="lede">
        Comparamos o preço dos mesmos produtos nas lojas todos os dias. Veja quantas vezes cada uma teve o menor preço e em
        quais produtos ela ganha hoje.
      </p>
      <ul className="guide-list">
        {reports.map(({ s, r }) => (
          <li key={s.slug}>
            <Link href={`/loja/${s.slug}`}>
              <strong>{s.name}</strong>
              <span>
                {r && r.compared
                  ? `menor preço em ${Math.round((r.wins / r.compared) * 100)}% das comparações · ${r.products} produtos acompanhados`
                  : "ver comparação"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
