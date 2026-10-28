import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Termos de uso",
  description: "Regras de uso do site, como funcionam os preços, os links de afiliado e os limites de responsabilidade.",
  alternates: { canonical: "/termos-de-uso" },
};

const UPDATED = "28 de outubro de 2026";

export default async function Termos() {
  const s = await getSettings();
  const owner = s.legal.ownerName || s.siteName;

  return (
    <article className="wrap page-text">
      <h1>Termos de uso</h1>
      <p className="updated">Última atualização: {UPDATED}</p>

      <p>
        Estes termos valem para quem usa o {s.siteName}, mantido por {owner}
        {s.legal.document ? ` (${s.legal.document})` : ""}. Ao navegar no site, você concorda com eles.
      </p>

      <h2>O que o site faz</h2>
      <p>
        Mostramos o histórico e o menor preço encontrado de produtos em lojas on-line, para ajudar você a decidir se uma
        oferta vale a pena. Não vendemos produtos: a compra, o pagamento, a entrega, a garantia e as trocas são feitos
        diretamente com a loja escolhida, sob as regras dela e do Código de Defesa do Consumidor.
      </p>

      <h2>Preços e informações</h2>
      <ul>
        <li>Os preços são coletados automaticamente e podem mudar a qualquer momento na loja.</li>
        <li>Pode haver diferença entre o preço mostrado aqui e o preço final, por frete, cupom, estoque ou região.</li>
        <li>O preço que vale é sempre o que aparece na loja no momento da compra.</li>
        <li>
          O veredito (“menor preço”, “desconto inflado” etc.) é uma análise automática do histórico, não uma garantia.
          Veja <Link href="/como-funciona">como calculamos</Link>.
        </li>
        <li>As fichas técnicas são resumos; confirme as especificações na página do fabricante ou da loja.</li>
      </ul>

      <h2>Links de afiliado e anúncios</h2>
      <p>
        Alguns links são de afiliado: se você comprar por eles, a loja nos paga uma comissão, sem custo extra para você.
        O site também pode exibir anúncios identificados como tal. Comissões e anúncios não mudam a forma como os preços e
        vereditos são calculados.
      </p>

      <h2>Uso permitido</h2>
      <p>
        Você pode usar o site para consulta pessoal. Não é permitido copiar o conteúdo em massa por robôs, tentar
        invadir ou sobrecarregar o site, nem usar a marca {s.siteName} sem autorização.
      </p>

      <h2>Propriedade intelectual</h2>
      <p>
        Marca, logo, textos e organização do site pertencem a {owner}. Nomes e imagens de produtos pertencem aos
        respectivos fabricantes e lojas e aparecem apenas para identificação.
      </p>

      <h2>Limites de responsabilidade</h2>
      <p>
        Fazemos o possível para manter as informações corretas, mas não respondemos por erros de preço das lojas,
        indisponibilidade de produtos, problemas na compra ou conteúdo de sites de terceiros. O site pode ficar fora do ar
        para manutenção ou por falhas técnicas.
      </p>

      <h2>Privacidade</h2>
      <p>
        O tratamento de dados pessoais está descrito na <Link href="/politica-de-privacidade">Política de privacidade</Link>.
      </p>

      <h2>Mudanças e foro</h2>
      <p>
        Podemos atualizar estes termos; a data no topo indica a versão em vigor. Vale a lei brasileira
        {s.legal.city ? `, e fica eleito o foro de ${s.legal.city}, ressalvado o direito do consumidor de usar o foro do seu domicílio` : ""}.
        Dúvidas? Fale com a gente pela <Link href="/contato">página de Contato</Link>.
      </p>
    </article>
  );
}
