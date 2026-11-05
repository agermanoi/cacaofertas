import type { ProductOverview } from "./types";

/**
 * Guias de preço: páginas que respondem perguntas como "qual o celular mais barato até R$ 1.500?"
 * ou "qual o iPhone mais barato hoje?", montadas com os dados do dia.
 * Só existe a página quando há pelo menos MIN_ITEMS produtos com preço.
 */
export interface Guide {
  slug: string;
  /** título curto, sem "hoje" (ex.: "Celulares até R$ 1.500") */
  title: string;
  /** substantivo para as perguntas (ex.: "celular") */
  noun: string;
  /** "o" / "a" para "Qual o celular…", "Qual a smart TV…" */
  art: "o" | "a";
  /** faixa de preço para as perguntas ("até R$ 1.500") */
  range?: string;
  intro: string;
  match: (p: ProductOverview) => boolean;
  /** coluna extra na tabela, tirada da ficha técnica (ex.: "Taxa de atualização") */
  specCol?: string;
  /** observação por produto (slug → texto), coluna "Observação" */
  notes?: Record<string, string>;
  /** perguntas com fatos fixos (confirmados), depois das perguntas calculadas */
  extraFaq?: { q: string; a: string }[];
  /** destaque calculado: o mais barato que atende a condição (ex.: TV com 120 Hz) */
  highlight?: { label: string; test: (spec: string, p: ProductOverview) => boolean };
  /** produtos relacionados mostrados à parte (ex.: o próprio jogo) */
  companions?: string[];
  /** some do índice e do sitemap depois desta data (AAAA-MM-DD) */
  until?: string;
}

export const MIN_ITEMS = 3;

const cat = (p: ProductOverview, c: string) => p.category === c;
const price = (p: ProductOverview) => Number(p.best_price);

const GTA_FAQ = [
  {
    q: "Em quais consoles o GTA 6 vai sair?",
    a: "A Rockstar confirmou o lançamento de GTA VI para 19 de novembro de 2026 no PlayStation 5 e no Xbox Series X|S. Ainda não há data para PC.",
  },
  {
    q: "GTA 6 vai sair para PS4 ou Xbox One?",
    a: "Não. O jogo foi anunciado só para a geração atual: PS5 (incluindo o PS5 Pro) e Xbox Series X|S.",
  },
];

export const GUIDES: Guide[] = [
  {
    slug: "console-para-gta-6",
    title: "Console para jogar GTA 6",
    noun: "console para GTA 6",
    art: "o",
    intro:
      "GTA VI chega em 19 de novembro de 2026 só para PS5 e Xbox Series X|S. Estes são os consoles que rodam o jogo, do mais barato ao mais caro hoje, comparados com a média recente de cada um.",
    match: (p) => ["playstation-5-slim", "playstation-5-pro", "xbox-series-x", "xbox-series-s"].includes(p.slug),
    notes: {
      "playstation-5-slim": "PS5 padrão; versão com leitor de disco ou digital",
      "playstation-5-pro": "PS5 mais potente: GPU maior e upscaling PSSR",
      "xbox-series-x": "Até 4K e 120 fps, com leitor de disco",
      "xbox-series-s": "Mais barato; só digital e resolução menor",
    },
    companions: ["gta-6-ps5", "gta-6-xbox", "controle-dualsense", "controle-xbox-series", "ssd-wd-black-sn850x-1tb-dissipador"],
    extraFaq: [
      ...GTA_FAQ,
      {
        q: "Precisa do PS5 Pro para jogar GTA 6?",
        a: "Não. GTA VI roda no PS5 comum e no PS5 Pro. O Pro tem GPU mais forte e upscaling próprio (PSSR), que costuma deixar a imagem mais nítida ou mais estável, mas a Rockstar ainda não detalhou as diferenças entre as versões.",
      },
      {
        q: "O Xbox Series S roda GTA 6?",
        a: "Sim, o Series S está entre as plataformas anunciadas. Ele é o mais barato, mas não tem leitor de disco (só jogos digitais) e trabalha com resolução menor que o Series X.",
      },
    ],
  },
  {
    slug: "tv-para-jogar-gta-6",
    title: "TV para jogar GTA 6",
    noun: "TV para jogar no console",
    art: "a",
    intro:
      "Para aproveitar PS5 e Xbox Series X, o que mais importa numa TV é ter 120 Hz, HDMI 2.1 e VRR. Comparamos as TVs que acompanhamos, com a taxa de atualização de cada uma, da mais barata à mais cara hoje.",
    match: (p) => p.category === "TVs",
    specCol: "Taxa de atualização",
    highlight: { label: "com 120 Hz ou mais", test: (s) => /\b(1[2-9]\d|[2-9]\d\d)\s?hz/i.test(s) },
    companions: ["playstation-5-slim", "xbox-series-x"],
    extraFaq: [
      {
        q: "Precisa de TV 120 Hz para jogar GTA 6?",
        a: "Não é obrigatório: o jogo roda em qualquer TV. Mas uma TV com 120 Hz, HDMI 2.1 e VRR aproveita melhor os modos de jogo do PS5 e do Xbox Series X e deixa o movimento mais fluido.",
      },
      {
        q: "Qual a diferença entre TV de 60 Hz e de 120 Hz para videogame?",
        a: "A TV de 120 Hz mostra até 120 quadros por segundo, o dobro da de 60 Hz. Em jogos com modo de 120 fps ou com VRR, o movimento fica mais suave e com menos atraso. Para filmes e TV aberta a diferença é pequena.",
      },
      ...GTA_FAQ.slice(0, 1),
    ],
  },
  {
    slug: "celular-ate-1500",
    title: "Celulares até R$ 1.500",
    noun: "celular",
    range: "até R$ 1.500",
    art: "o",
    intro: "Os celulares que acompanhamos com preço de até R$ 1.500 hoje, do mais barato ao mais caro, com a média recente de cada um.",
    match: (p) => cat(p, "Smartphones") && price(p) <= 1500,
  },
  {
    slug: "celular-ate-2500",
    title: "Celulares até R$ 2.500",
    noun: "celular",
    range: "até R$ 2.500",
    art: "o",
    intro: "Celulares intermediários com preço de até R$ 2.500 hoje. A faixa com mais opções de Samsung, Motorola e Xiaomi.",
    match: (p) => cat(p, "Smartphones") && price(p) <= 2500,
  },
  {
    slug: "celular-ate-4000",
    title: "Celulares até R$ 4.000",
    noun: "celular",
    range: "até R$ 4.000",
    art: "o",
    intro: "Celulares até R$ 4.000 hoje, incluindo iPhones de gerações anteriores e intermediários premium.",
    match: (p) => cat(p, "Smartphones") && price(p) <= 4000,
  },
  {
    slug: "iphone-mais-barato",
    title: "iPhone mais barato",
    noun: "iPhone",
    art: "o",
    intro: "Todos os iPhones que acompanhamos, do mais barato ao mais caro hoje. Modelos de gerações anteriores costumam ter as maiores quedas reais.",
    match: (p) => cat(p, "Smartphones") && /^iphone/i.test(p.name),
  },
  {
    slug: "samsung-galaxy-mais-barato",
    title: "Samsung Galaxy mais barato",
    noun: "Galaxy",
    art: "o",
    intro: "Os celulares Samsung Galaxy que acompanhamos, das linhas A, S e FE, do mais barato ao mais caro hoje.",
    match: (p) => cat(p, "Smartphones") && /galaxy/i.test(p.name),
  },
  {
    slug: "smart-tv-mais-barata",
    title: "Smart TV mais barata",
    noun: "smart TV",
    art: "a",
    intro: "As smart TVs 4K, QLED e Mini LED que acompanhamos, da mais barata à mais cara hoje.",
    match: (p) => cat(p, "TVs"),
  },
  {
    slug: "notebook-mais-barato",
    title: "Notebook mais barato",
    noun: "notebook",
    art: "o",
    intro: "Notebooks para estudo, trabalho e jogos, do mais barato ao mais caro hoje. Confira a configuração de cada um na página do produto.",
    match: (p) => cat(p, "Informática") && /notebook|macbook/i.test(p.name),
  },
  {
    slug: "videogame-mais-barato",
    title: "Videogame mais barato",
    noun: "videogame",
    art: "o",
    intro: "PlayStation, Xbox, Nintendo Switch e Meta Quest, do mais barato ao mais caro hoje.",
    match: (p) => cat(p, "Games") && /playstation|xbox|switch|quest/i.test(p.name),
  },
  {
    slug: "smartwatch-mais-barato",
    title: "Smartwatch mais barato",
    noun: "smartwatch",
    art: "o",
    intro: "Apple Watch, Galaxy Watch e Xiaomi, do mais barato ao mais caro hoje.",
    match: (p) => /watch/i.test(p.name),
  },
  {
    slug: "fone-bluetooth-mais-barato",
    title: "Fone bluetooth mais barato",
    noun: "fone bluetooth",
    art: "o",
    intro: "Fones sem fio e headsets que acompanhamos, do mais barato ao mais caro hoje.",
    match: (p) => /airpods|buds|fone|headset/i.test(p.name),
  },
  {
    slug: "air-fryer-mais-barata",
    title: "Air fryer mais barata",
    noun: "air fryer",
    art: "a",
    intro: "As air fryers que acompanhamos, da mais barata à mais cara hoje.",
    match: (p) => /air ?fryer/i.test(p.name),
  },
  {
    slug: "cafeteira-mais-barata",
    title: "Cafeteira mais barata",
    noun: "cafeteira",
    art: "a",
    intro: "Cafeteiras de cápsula Nespresso e Dolce Gusto, da mais barata à mais cara hoje.",
    match: (p) => /cafeteira|nespresso|dolce gusto/i.test(p.name),
  },
];

export function guideItems(g: Guide, all: ProductOverview[]): ProductOverview[] {
  return all.filter((p) => p.best_price != null && g.match(p)).sort((a, b) => price(a) - price(b));
}

export function liveGuides(all: ProductOverview[]): { guide: Guide; count: number }[] {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return GUIDES.filter((g) => !g.until || today <= g.until)
    .map((guide) => ({ guide, count: guideItems(guide, all).length }))
    .filter((x) => x.count >= MIN_ITEMS);
}

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug) || null;
