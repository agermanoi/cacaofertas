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
}

export const MIN_ITEMS = 3;

const cat = (p: ProductOverview, c: string) => p.category === c;
const price = (p: ProductOverview) => Number(p.best_price);

export const GUIDES: Guide[] = [
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
  return GUIDES.map((guide) => ({ guide, count: guideItems(guide, all).length })).filter((x) => x.count >= MIN_ITEMS);
}

export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug) || null;
