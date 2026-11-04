import { siteUrl } from "./site";
import type { ProductOverview } from "./types";
import type { Verdict } from "./verdict";
import { periodLabel } from "./verdict";

/** BreadcrumbList (JSON-LD) com URLs absolutas: aparece como trilha no resultado do Google. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${base}${it.path}`,
    })),
  };
}

/** Mês e ano por extenso em português ("novembro de 2026"). */
export function monthYear(now = new Date()): string {
  return now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" });
}

/* ------------------------------------------------------------------ perguntas do produto */


const brlFaq = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Perguntas e respostas com os números do dia (o que as pessoas perguntam no Google e no ChatGPT).
 * Tudo vem dos dados do site; sem preço, sem pergunta.
 */
export function productFaq(
  p: ProductOverview,
  v: Verdict,
  opts: { stores: number; seen: string | null }
): { q: string; a: string }[] {
  if (p.best_price == null) return [];
  const price = brlFaq(Number(p.best_price));
  const where = p.best_store ? ` (${p.best_store})` : "";
  const avg = p.avg_30d != null ? brlFaq(Number(p.avg_30d)) : null;
  const per = periodLabel(p.days_tracked);
  const when = opts.seen ? ` Preço visto em ${opts.seen}; pode mudar a qualquer momento.` : "";
  const out: { q: string; a: string }[] = [];

  const cheap: Record<string, string> = {
    record: `Sim. ${price}${where} é o menor preço que já registramos, ${Math.round((v.vsAvg || 0) * 100)}% abaixo da média dos últimos ${per}${avg ? ` (${avg})` : ""}.`,
    below: `Sim. ${price}${where} está ${Math.round((v.vsAvg || 0) * 100)}% abaixo da média dos últimos ${per}${avg ? ` (${avg})` : ""}.`,
    normal: `O preço está o de sempre: ${price}${where}, dentro da faixa dos últimos ${per}${avg ? ` (média de ${avg})` : ""}.`,
    above: `Agora não. ${price}${where} está ${Math.round(-(v.vsAvg || 0) * 100)}% acima da média dos últimos ${per}${avg ? ` (${avg})` : ""}.`,
    fake: `Sem pressa. O preço de hoje, ${price}${where}, está na média dos últimos ${per}; o preço "de" anunciado não apareceu nesse período, então o desconto é menor do que parece.`,
    half: `Sem pressa. A loja anuncia cerca de 50% de desconto, mas ${price}${where} está na média dos últimos ${per}: o preço "de" foi inflado.`,
    learning: `O menor preço agora é ${price}${where}. Ainda estamos juntando histórico (${per}) para dizer se está barato.`,
  };
  out.push({ q: `Vale a pena comprar ${p.name} hoje?`, a: `${cheap[v.kind] || cheap.normal}${when}` });

  if (p.min_all != null) {
    out.push({
      q: `Qual o menor preço já registrado de ${p.name}?`,
      a: `O menor preço que registramos foi ${brlFaq(Number(p.min_all))}, em ${Number(p.days_tracked || 0)} ${Number(p.days_tracked || 0) === 1 ? "dia" : "dias"} de acompanhamento. Hoje o melhor preço é ${price}${where}.`,
    });
  }

  out.push({
    q: `Onde comprar ${p.name} mais barato?`,
    a: `Agora o menor preço é ${price}${p.best_store ? ` ${/^(casas)/i.test(p.best_store) ? "nas" : /^(mercado|magazine|carrefour|extra|ponto)/i.test(p.best_store) ? "no" : "na"} ${p.best_store}` : ""}, comparando ${opts.stores} ${opts.stores === 1 ? "oferta" : "ofertas"} de lojas confiáveis.${when}`,
  });

  const wait: Record<string, string> = {
    record: "O preço de hoje já é o menor que vimos. Datas como a Black Friday podem trazer quedas, mas não há garantia de que fique mais barato.",
    below: "O preço de hoje já está abaixo da média. Pode cair mais em datas como a Black Friday, mas muitas lojas sobem o preço antes; acompanhe o histórico nesta página.",
    above: "Vale esperar: o preço está acima da média recente e costuma voltar ao normal.",
    fake: "O desconto anunciado não é real. Se não tiver pressa, espere uma queda de verdade no histórico.",
    half: "O desconto anunciado não é real. Se não tiver pressa, espere uma queda de verdade no histórico.",
  };
  out.push({
    q: `Vale esperar a Black Friday para comprar ${p.name}?`,
    a: wait[v.kind] || "Hoje está no preço de sempre. Se não tiver pressa, acompanhe o histórico: uma queda real aparece aqui no mesmo dia.",
  });
  return out;
}

export function faqLd(items: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}
