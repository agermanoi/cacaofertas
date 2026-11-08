import type { Metadata } from "next";
import Link from "next/link";
import { siteUrl } from "@/lib/site";
import { getOverview } from "@/lib/data";

export const revalidate = 86400;

const AUTHOR = "Alexandre Germano";

export const metadata: Metadata = {
  title: "Quem somos",
  description: `O Caça Ofertas é mantido por ${AUTHOR}. Conheça o projeto, como coletamos os preços e como o site se sustenta.`,
  alternates: { canonical: "/quem-somos" },
};

export default async function QuemSomos() {
  const products = await getOverview();
  const tracked = products.filter((p) => p.best_price != null).length;
  const categories = new Set(products.map((p) => p.category)).size;

  const ld = {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    url: `${siteUrl()}/quem-somos`,
    name: "Quem somos",
    mainEntity: {
      "@type": "Organization",
      "@id": `${siteUrl()}/#organizacao`,
      name: "Caça Ofertas",
      url: siteUrl(),
      founder: { "@type": "Person", name: AUTHOR },
    },
  };

  return (
    <article className="wrap page-text">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <h1>Quem somos</h1>

      <p>
        O Caça Ofertas é um projeto independente criado e mantido por <strong>{AUTHOR}</strong>, profissional de
        publicidade digital e desenvolvimento web. A ideia nasceu de uma pergunta simples, que todo mundo faz antes da
        Black Friday: <em>esse desconto é de verdade?</em>
      </p>
      <p>
        Lojas anunciam “de R$ 4.000 por R$ 2.000” com frequência, mas é difícil saber quanto o produto custava na semana
        anterior. Por isso o site guarda o preço de cada produto todos os dias e mostra o histórico, a média e um veredito
        direto: se é o menor preço já visto, se está na média ou se o desconto é inflado.
      </p>

      <h2>O que fazemos</h2>
      <ul>
        <li>
          Acompanhamos hoje <strong>{tracked} produtos</strong> em {categories} categorias, com o preço lido duas vezes por
          dia em várias lojas.
        </li>
        <li>Guardamos o menor preço de cada loja em cada dia e montamos o gráfico de histórico de cada produto.</li>
        <li>
          Escrevemos uma análise de cada produto a partir desses números: faixa de preço, tendência da semana, loja que
          costuma ser mais barata e quanto do desconto anunciado é real.
        </li>
        <li>
          Montamos <Link href="/precos">guias de preço</Link> comparando produtos da mesma faixa, com base no mesmo
          histórico.
        </li>
      </ul>
      <p>
        Os detalhes de coleta e os critérios de cada veredito estão em <Link href="/como-funciona">Como medimos os preços</Link>.
      </p>

      <h2>Independência</h2>
      <p>
        Nenhuma loja paga para aparecer no site nem para ter um veredito melhor. O veredito sai só do histórico de preço,
        com as mesmas regras para todos os produtos. Se a loja aumenta o preço “de” antes de uma promoção, o site mostra
        isso, mesmo que seja uma loja parceira.
      </p>

      <h2>Como o site se sustenta</h2>
      <p>
        Alguns links para as lojas são de afiliado: se você comprar depois de clicar em “Ver na loja”, a loja pode nos
        pagar uma comissão. O preço para você é o mesmo. O site também pode exibir anúncios, sempre identificados como
        publicidade.
      </p>

      <h2>Fale com a gente</h2>
      <p>
        Viu um preço errado ou quer sugerir um produto para acompanharmos? Use a página de{" "}
        <Link href="/contato">contato</Link>. Correções de preço e de ficha técnica são feitas em até 2 dias úteis.
      </p>
    </article>
  );
}
