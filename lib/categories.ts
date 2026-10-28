import { slugify } from "./slug";

/**
 * Textos de cada categoria (título, introdução e dicas de compra).
 * Categoria nova criada no painel funciona sem estar aqui: ganha um texto padrão.
 */
interface CategoryInfo {
  title: string;
  intro: string;
  tips: string[];
}

const INFO: Record<string, CategoryInfo> = {
  Smartphones: {
    title: "Celulares na Black Friday",
    intro:
      "iPhone, Galaxy, Motorola e Xiaomi com o menor preço de hoje e o histórico de cada um. Celular é o produto em que mais aparece o falso desconto: o preço sobe em outubro para “cair” em novembro. O gráfico mostra se a queda é real.",
    tips: [
      "Compare a mesma memória: a versão de 256 GB costuma custar pouco mais que a de 128 GB na Black Friday.",
      "Modelos do ano anterior costumam ter as maiores quedas reais.",
      "Confira se o anúncio é de vendedor oficial e se o aparelho é novo, não recondicionado.",
    ],
  },
  TVs: {
    title: "Smart TVs na Black Friday",
    intro:
      "Smart TVs 4K, QLED e OLED de Samsung, LG e TCL com o menor preço de hoje e o histórico. TV é campeã de desconto real na Black Friday, mas também de preço inflado em outubro: veja a média de 30 dias antes de comprar.",
    tips: [
      "Para sala, 55 polegadas é o tamanho com melhor custo por polegada na maioria das linhas.",
      "QLED e Mini LED brilham mais em sala clara; OLED tem o melhor contraste em ambiente escuro.",
      "Confira se o modelo é do ano atual: o código muda pouco entre gerações (ex.: DU8000 e U8000F).",
    ],
  },
  Informática: {
    title: "Notebooks e informática na Black Friday",
    intro:
      "Notebooks, MacBook, monitores, SSD, periféricos e impressoras com o menor preço de hoje e o histórico de cada um. Em notebook, a mesma linha tem várias configurações: o filtro de cada produto acompanha uma configuração específica.",
    tips: [
      "Confira memória e armazenamento no anúncio: o mesmo modelo existe com 8, 16 e 24 GB.",
      "Para jogos, a placa de vídeo (RTX 3050, 4050) pesa mais que o processador.",
      "SSD NVMe de 1 TB é o upgrade com melhor custo-benefício para PC e PS5.",
    ],
  },
  Tablets: {
    title: "Tablets na Black Friday",
    intro:
      "iPad, Galaxy Tab e Redmi Pad com o menor preço de hoje e o histórico. Tablets costumam ter descontos reais na Black Friday, principalmente nas versões só Wi-Fi.",
    tips: [
      "Para estudo e streaming, 128 GB costuma ser suficiente.",
      "Capa com teclado e caneta raramente entram no desconto: compare o preço do kit separado.",
    ],
  },
  Games: {
    title: "Consoles e games na Black Friday",
    intro:
      "PlayStation 5, Xbox, Nintendo Switch, controles e VR com o menor preço de hoje e o histórico. Console tem pouca variação de preço no ano, então qualquer queda abaixo da média é sinal de boa compra.",
    tips: [
      "Kits com jogo incluso podem sair mais baratos que console e jogo separados.",
      "Confira a capacidade do SSD do console e a versão (com ou sem leitor de disco).",
    ],
  },
  "Áudio e Wearables": {
    title: "Fones, caixas de som e smartwatches na Black Friday",
    intro:
      "AirPods, JBL, Galaxy Buds, Apple Watch e Galaxy Watch com o menor preço de hoje e o histórico. É uma categoria com muita variação de preço entre lojas no mesmo dia.",
    tips: [
      "Em smartwatch, a versão com celular (LTE) custa bem mais: confira se é a só GPS.",
      "Fones e caixas de som têm descontos frequentes ao longo do ano: compare com a mínima de 90 dias.",
    ],
  },
  "Casa inteligente": {
    title: "Echo, Kindle e Fire TV na Black Friday",
    intro:
      "Echo Dot, Echo Show, Kindle e Fire TV Stick com o menor preço de hoje e o histórico. Os dispositivos da Amazon costumam bater o menor preço do ano na Black Friday.",
    tips: [
      "A Amazon costuma repetir o preço da Black Friday no Prime Day: veja a mínima de 90 dias.",
    ],
  },
  Eletroportáteis: {
    title: "Air fryers, cafeteiras e eletroportáteis na Black Friday",
    intro:
      "Air fryers, cafeteiras e robôs aspiradores com o menor preço de hoje e o histórico. Muitos modelos têm versão 110 V e 220 V com preços diferentes.",
    tips: ["Confira a voltagem no anúncio antes de comprar.", "Em cafeteiras de cápsula, considere o preço das cápsulas no uso do dia a dia."],
  },
  Eletrodomésticos: {
    title: "Eletrodomésticos na Black Friday",
    intro:
      "Ar-condicionado e outros eletrodomésticos com o menor preço de hoje e o histórico. Itens grandes costumam ter frete alto: compare o preço final com frete.",
    tips: ["Confira voltagem, frete e se a instalação está inclusa."],
  },
};

export function categorySlug(name: string): string {
  return slugify(name);
}

export function categoryInfo(name: string): CategoryInfo {
  return (
    INFO[name] || {
      title: `${name} na Black Friday`,
      intro: `${name} com o menor preço de hoje e o histórico de cada produto, para você saber se o desconto é de verdade.`,
      tips: [],
    }
  );
}
