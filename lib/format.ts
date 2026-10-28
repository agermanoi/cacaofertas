const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function money(v: number | null | undefined): string {
  return v == null ? "—" : brl.format(Number(v));
}

/** Separa reais e centavos para a etiqueta de preço. */
export function moneyParts(v: number): { int: string; cents: string } {
  const [int, cents] = Number(v).toFixed(2).split(".");
  return { int: Number(int).toLocaleString("pt-BR"), cents };
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

export function shortDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

/** Dias até a Black Friday (última sexta de novembro). */
export function blackFriday(now = new Date()): { date: Date; days: number } {
  const year = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const d = new Date(Date.UTC(year, 10, 30, 12));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  const days = Math.max(0, Math.ceil((d.getTime() - now.getTime()) / 86_400_000));
  return { date: d, days };
}
