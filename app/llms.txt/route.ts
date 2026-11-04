import { getOverview } from "@/lib/data";
import { liveGuides } from "@/lib/guides";
import { categorySlug } from "@/lib/categories";
import { siteUrl } from "@/lib/site";

/**
 * /llms.txt — resumo do site para assistentes de IA (ChatGPT, Claude, Perplexity…):
 * o que é, como os dados são coletados e onde está cada página.
 */
export const revalidate = 3600;

export async function GET() {
  const base = siteUrl();
  const all = await getOverview();
  const priced = all.filter((p) => p.best_price != null);
  const cats = [...new Set(priced.map((p) => p.category))];
  const lines = [
    "# Caça Ofertas",
    "",
    "> Comparador brasileiro de preços com histórico diário. Para cada produto mostra o menor preço do dia entre lojas confiáveis (Amazon, Mercado Livre e outras), a média dos dias acompanhados (até 30), o menor preço já registrado e se o desconto anunciado é real.",
    "",
    "- Preços coletados duas vezes por dia; cada preço mostra a data e a hora em que foi visto.",
    '- Vereditos: "Menor preço já visto", "X% abaixo da média", "Preço normal", "Acima da média", "Desconto menor do que parece" (preço "de" que não foi praticado) e "Metade do dobro" (cerca de 50% de desconto sobre um preço inflado).',
    "- Os links para as lojas são de afiliado; isso não muda o preço para quem compra.",
    `- Metodologia: ${base}/como-funciona`,
    "",
    "## Guias de preço (o mais barato de hoje)",
    ...liveGuides(all).map((g) => `- [${g.guide.title}](${base}/precos/${g.guide.slug})`),
    "",
    "## Categorias",
    ...cats.map((c) => `- [${c}](${base}/categoria/${categorySlug(c)})`),
    "",
    "## Produtos",
    ...priced.map((p) => `- [${p.name}](${base}/produto/${p.slug}): histórico de preço e menor preço de hoje`),
    "",
    "## Outras páginas",
    `- [Ofertas de hoje](${base}/hoje)`,
    `- [Cupons de desconto](${base}/cupons)`,
    `- [Calendário de promoções (11.11, Black Friday, Natal)](${base}/datas)`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
