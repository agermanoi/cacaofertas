import type { Metadata } from "next";
import { AdSlot } from "@/components/AdSlot";

export const metadata: Metadata = {
  title: "Como medimos os preços",
  description: "De onde vêm os preços, como montamos o histórico e como decidimos se um desconto é real.",
  alternates: { canonical: "/como-funciona" },
};

export default function ComoFunciona() {
  return (
    <article className="wrap page-text">
      <h1>Como medimos os preços</h1>

      <h2>De onde vêm os preços</h2>
      <p>
        Duas vezes por dia consultamos o Mercado Livre, o Google Shopping (que reúne dezenas de lojas), o catálogo de
        lojas parceiras da rede Lomadee e algumas páginas de produto que acompanhamos diretamente. Anúncios usados,
        recondicionados e acessórios (capas, películas, controles avulsos) são descartados.
      </p>

      <AdSlot id="conteudo-meio" format="retangulo" />

      <h2>Como montamos o histórico</h2>
      <p>
        Para cada produto guardamos o menor preço à vista de cada loja em cada dia. A linha principal do gráfico é o
        menor preço do dia entre todas as lojas.
      </p>

      <h2>Como decidimos o veredito</h2>
      <dl className="defs">
        <dt className="v-record">Menor preço já visto</dt>
        <dd>O preço de hoje empata ou bate o menor valor registrado desde que começamos a acompanhar.</dd>
        <dt className="v-below">Abaixo da média</dt>
        <dd>Pelo menos 7% mais barato que a média dos últimos 30 dias.</dd>
        <dt className="v-normal">Preço de sempre</dt>
        <dd>Dentro da faixa normal dos últimos 30 dias, mesmo que a loja anuncie desconto.</dd>
        <dt className="v-above">Acima da média</dt>
        <dd>Pelo menos 5% mais caro que a média. Provavelmente vale esperar.</dd>
        <dt className="v-fake">Desconto menor do que parece</dt>
        <dd>
          O preço “de” anunciado está mais de 15% acima do maior valor que vimos nos últimos 30 dias, e o preço de hoje
          está dentro da média. O produto pode valer a pena, mas o desconto real é menor que o anunciado.
        </dd>
        <dt className="v-half">Metade do dobro</dt>
        <dd>
          O caso clássico da Black Friday: a loja anuncia uns 50% de desconto em cima de um preço “de” que não vimos nos
          últimos 30 dias, e o preço de hoje está na média. Na prática, o desconto é quase nenhum.
        </dd>
      </dl>

      <h2>Links de afiliado</h2>
      <p>
        Quando você clica em “Ver na loja”, podemos receber uma comissão se a compra acontecer. O preço para você é o
        mesmo, e a comissão não entra no cálculo do veredito.
      </p>
    </article>
  );
}
