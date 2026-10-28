import type { ProductOverview } from "./types";

export type VerdictKind = "record" | "below" | "normal" | "above" | "fake" | "learning" | "empty";

export interface Verdict {
  kind: VerdictKind;
  label: string;
  /** frase curta para explicar o veredito */
  detail: string;
  /** queda (positiva) ou alta (negativa) do preço atual vs média de 30 dias */
  vsAvg: number | null;
}

const MIN_DAYS = Number(process.env.NEXT_PUBLIC_MIN_DAYS_FOR_VERDICT || 5);

export function verdictFor(p: ProductOverview): Verdict {
  const best = p.best_price != null ? Number(p.best_price) : null;
  const avg = p.avg_30d != null ? Number(p.avg_30d) : null;
  const days = Number(p.days_tracked || 0);

  if (best == null) {
    return { kind: "empty", label: "Sem oferta agora", detail: "Nenhuma loja com estoque na última coleta.", vsAvg: null };
  }
  if (days < MIN_DAYS || avg == null) {
    return {
      kind: "learning",
      label: "Medindo preço",
      detail: `${days} ${days === 1 ? "dia" : "dias"} de histórico. O veredito aparece com ${MIN_DAYS}.`,
      vsAvg: null,
    };
  }

  const vsAvg = (avg - best) / avg;
  const list = p.best_list_price != null ? Number(p.best_list_price) : null;
  const max = p.max_30d != null ? Number(p.max_30d) : null;

  if (list && max && list > max * 1.15 && vsAvg < 0.03) {
    return {
      kind: "fake",
      label: "Desconto maquiado",
      detail: `O "de" de ${fmt(list)} nunca foi praticado nos últimos 30 dias. O preço está na média.`,
      vsAvg,
    };
  }
  if (p.min_all != null && best <= Number(p.min_all) * 1.005 && vsAvg > 0.02) {
    return { kind: "record", label: "Menor preço já visto", detail: `${Math.round(vsAvg * 100)}% abaixo da média de 30 dias.`, vsAvg };
  }
  if (vsAvg >= 0.07) {
    return { kind: "below", label: "Abaixo da média", detail: `${Math.round(vsAvg * 100)}% mais barato que a média de 30 dias.`, vsAvg };
  }
  if (vsAvg <= -0.05) {
    return { kind: "above", label: "Acima da média", detail: `${Math.round(-vsAvg * 100)}% mais caro que a média de 30 dias. Vale esperar.`, vsAvg };
  }
  return { kind: "normal", label: "Preço de sempre", detail: "Dentro da faixa dos últimos 30 dias.", vsAvg };
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
