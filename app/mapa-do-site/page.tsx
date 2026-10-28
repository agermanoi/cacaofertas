import type { Metadata } from "next";
import Link from "next/link";
import { getOverview } from "@/lib/data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Mapa do site",
  description: "Todos os produtos acompanhados e as páginas do site, organizados por categoria.",
  alternates: { canonical: "/mapa-do-site" },
};

export default async function MapaDoSite() {
  const products = await getOverview();
  const byCategory = new Map<string, typeof products>();
  for (const p of products) {
    const list = byCategory.get(p.category) || [];
    list.push(p);
    byCategory.set(p.category, list);
  }
  const categories = [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b, "pt-BR"));

  return (
    <article className="wrap page-text sitemap-page">
      <h1>Mapa do site</h1>
      <p>Todos os produtos que acompanhamos, por categoria, e as páginas institucionais.</p>

      {categories.map(([cat, list]) => (
        <section key={cat}>
          <h2>{cat}</h2>
          <ul>
            {list
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
              .map((p) => (
                <li key={p.slug}>
                  <Link href={`/produto/${p.slug}`}>{p.name}</Link>
                </li>
              ))}
          </ul>
        </section>
      ))}

      <section>
        <h2>Institucional</h2>
        <ul>
          <li>
            <Link href="/">Página inicial</Link>
          </li>
          <li>
            <Link href="/como-funciona">Como medimos os preços</Link>
          </li>
          <li>
            <Link href="/contato">Contato</Link>
          </li>
          <li>
            <Link href="/politica-de-privacidade">Política de privacidade</Link>
          </li>
          <li>
            <Link href="/termos-de-uso">Termos de uso</Link>
          </li>
        </ul>
      </section>
    </article>
  );
}
