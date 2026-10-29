import type { Metadata } from "next";
import Link from "next/link";
import { getSettings } from "@/lib/settings";

export const metadata: Metadata = {
  title: "Política de privacidade",
  description: "Quais dados coletamos, para quê, com quem compartilhamos e como exercer seus direitos pela LGPD.",
  alternates: { canonical: "/politica-de-privacidade" },
};

const UPDATED = "28 de outubro de 2026";

export default async function Privacidade() {
  const s = await getSettings();
  const owner = s.legal.ownerName || s.siteName;
  const contact = s.contact.email ? (
    <a href={`mailto:${s.contact.email}`}>{s.contact.email}</a>
  ) : (
    <Link href="/contato">página de Contato</Link>
  );

  return (
    <article className="wrap page-text">
      <h1>Política de privacidade</h1>
      <p className="updated">Última atualização: {UPDATED}</p>

      <p>
        Esta política explica como o {s.siteName} trata dados pessoais, de acordo com a Lei Geral de Proteção de Dados
        (Lei 13.709/2018, a LGPD). O responsável pelo tratamento (controlador) é {owner}
        {s.legal.document ? `, inscrito sob ${s.legal.document}` : ""}.
      </p>

      <h2>Resumo</h2>
      <ul>
        <li>Você não precisa criar conta nem informar dados para usar o site.</li>
        <li>Só pedimos nome e e-mail se você enviar uma mensagem pelo Contato.</li>
        <li>Não vendemos dados pessoais.</li>
        <li>As lojas para onde enviamos você têm as próprias políticas de privacidade.</li>
      </ul>

      <h2>Quais dados coletamos e por quê</h2>
      <ul>
        <li>
          <strong>Formulário de contato:</strong> nome, e-mail, assunto e mensagem, para responder você. Base legal:
          consentimento e legítimo interesse em atender pedidos. Guardamos por até 12 meses depois da última troca de
          mensagens.
        </li>
        <li>
          <strong>Cliques em ofertas:</strong> quando você clica em “Ver na loja”, registramos qual oferta foi clicada,
          data e hora e a página de origem, sem identificar você. Usamos para saber quais ofertas interessam e para
          conferir comissões com as lojas.
        </li>
        <li>
          <strong>Dados técnicos:</strong> nossos provedores de hospedagem registram endereço IP, navegador e páginas
          acessadas por motivos de segurança e funcionamento, por prazo limitado.
        </li>
      </ul>

      <h2>Cookies</h2>
      <p>
        O site em si não usa cookies de rastreamento para visitantes. Ao clicar em um link de oferta, a loja ou a rede de
        afiliados (como Mercado Livre, Amazon e Lomadee) pode gravar cookies no seu navegador para atribuir a venda. Se
        exibirmos anúncios, parceiros como o Google podem usar cookies para mostrar anúncios relevantes; você pode
        desativar anúncios personalizados em{" "}
        <a href="https://adssettings.google.com" rel="noopener">
          adssettings.google.com
        </a>
        . Você também pode bloquear ou apagar cookies nas configurações do navegador.
      </p>
      <p>
        Para saber quais páginas e ofertas interessam mais, contamos visitas e cliques sem cookies: registramos a página,
        o site de origem (por exemplo, Instagram ou Google) e o tipo de aparelho. Para contar visitantes únicos usamos um
        código que muda todo dia, gerado a partir do endereço de rede e do navegador; o endereço de rede não é guardado e o
        código não permite identificar você.
      </p>

      <h2>Com quem compartilhamos</h2>
      <p>
        Usamos provedores que guardam e processam dados em nosso nome: hospedagem (Vercel) e banco de dados (Supabase),
        que podem armazenar informações fora do Brasil com garantias contratuais de proteção. Também podemos
        compartilhar dados quando a lei ou uma autoridade exigir.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Pela LGPD (art. 18), você pode pedir a qualquer momento: confirmação de que tratamos seus dados, acesso, correção,
        anonimização ou exclusão, portabilidade, informação sobre compartilhamento e revogação do consentimento. Basta
        escrever para {contact}. Respondemos em até 15 dias. Você também pode reclamar à Autoridade Nacional de Proteção
        de Dados (ANPD).
      </p>

      <h2>Segurança</h2>
      <p>
        Os dados ficam em serviços com conexão criptografada e acesso restrito à equipe. Nenhum sistema é 100% seguro;
        se houver um incidente que traga risco a você, avisaremos conforme a lei.
      </p>

      <h2>Menores de idade</h2>
      <p>O site não é direcionado a menores de 18 anos e não coletamos dados deles de propósito.</p>

      <h2>Mudanças nesta política</h2>
      <p>
        Podemos atualizar este texto. A data no topo mostra a última versão. Mudanças relevantes serão destacadas no
        site.
      </p>
    </article>
  );
}
