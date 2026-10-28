/**
 * Formatos de anúncio do site e tamanhos aceitos por tela.
 * Usado pelo AdSlot (size mapping do GPT) e pelo painel (lista para criar line items no GAM).
 */

export type AdFormat = "leaderboard" | "retangulo" | "infeed" | "rodape";
export type AdSize = [number, number] | "fluid";

export interface FormatDef {
  label: string;
  desktop: AdSize[]; // ≥ 1024 px
  tablet: AdSize[]; // 768–1023 px
  mobile: AdSize[]; // < 768 px
}

export const FORMATS: Record<AdFormat, FormatDef> = {
  leaderboard: {
    label: "Topo (faixa)",
    desktop: [[970, 90], [728, 90]],
    tablet: [[728, 90]],
    mobile: [[320, 100], [320, 50]],
  },
  retangulo: {
    label: "Retângulo",
    desktop: [[336, 280], [300, 250]],
    tablet: [[336, 280], [300, 250]],
    mobile: [[300, 250]],
  },
  infeed: {
    label: "Entre itens da lista",
    desktop: [[728, 90], "fluid"],
    tablet: [[728, 90], "fluid"],
    mobile: [[300, 250], [320, 100], "fluid"],
  },
  rodape: {
    label: "Antes do rodapé",
    desktop: [[970, 250], [970, 90], [728, 90]],
    tablet: [[728, 90]],
    mobile: [[300, 250], [320, 100]],
  },
};

/** Posições usadas no site (para o painel mostrar o que criar no GAM). */
export const POSITIONS: { id: string; format: AdFormat; where: string }[] = [
  { id: "home-topo", format: "leaderboard", where: "Home, abaixo do destaque" },
  { id: "home-lista-1", format: "infeed", where: "Home, depois do 6º produto" },
  { id: "home-lista-2", format: "infeed", where: "Home, depois do 14º produto" },
  { id: "home-rodape", format: "rodape", where: "Home, antes do rodapé" },
  { id: "categoria-topo", format: "leaderboard", where: "Categorias, acima da lista" },
  { id: "categoria-lista-1", format: "infeed", where: "Categorias, depois do 6º produto" },
  { id: "categoria-lista-2", format: "infeed", where: "Categorias, depois do 14º produto" },
  { id: "categoria-rodape", format: "rodape", where: "Categorias, antes do rodapé" },
  { id: "produto-topo", format: "leaderboard", where: "Produto, acima do gráfico" },
  { id: "produto-rodape", format: "retangulo", where: "Produto, depois da ficha técnica" },
  { id: "cupons-topo", format: "leaderboard", where: "Cupons, abaixo dos destaques" },
  { id: "cupons-meio", format: "infeed", where: "Cupons, no meio das lojas" },
  { id: "conteudo-meio", format: "retangulo", where: "Página “Como funciona”" },
];

export function sizesLabel(list: AdSize[]): string {
  return list.map((s) => (s === "fluid" ? "fluid" : `${s[0]}x${s[1]}`)).join(", ");
}

/** Todos os tamanhos de um formato (para o defineSlot). */
export function allSizes(f: FormatDef): AdSize[] {
  const seen = new Set<string>();
  const out: AdSize[] = [];
  for (const s of [...f.desktop, ...f.tablet, ...f.mobile]) {
    const k = s === "fluid" ? "fluid" : `${s[0]}x${s[1]}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push(s);
    }
  }
  return out;
}
