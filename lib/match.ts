import type { OfferInput, Product } from "./types";

/**
 * Minúsculas, sem acento, só letras/números.
 * Separa letra→número ("watch8" → "watch 8", "ps5" → "ps 5") e número→unidade
 * ("128gb" → "128 gb"), mas mantém "16e" junto para não confundir modelos.
 */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/(\d)(gb|tb|mm|pol|polegadas|l|w|v|btu)\b/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cada item de `must` precisa aparecer no título.
 * Use "a|b" para alternativas (ex.: "ps5|playstation 5").
 * Termos curtos/numéricos (ex.: "16", "s25") exigem limite de palavra
 * para não casar "16" com "160" ou "iphone 16e".
 */
/** Palavras do título original (sem acento; hífen, ponto e barra juntam as partes: "AFN-40-BI" → "afn40bi"). */
function codeWords(raw: string): string[] {
  return raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[-./]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function hasTerm(title: string, term: string, raw: string): boolean {
  return term.split("|").some((alt) => {
    // "~codigo" = código de modelo: pode estar no meio de uma palavra ("~u8000f" casa com
    // "UN55U8000FGXZD"), ou começar uma palavra e continuar na seguinte ("~afn40" casa com
    // "AFN 40"). Não atravessa palavras de outro jeito: "~du8000" não casa com "UHD U8000h".
    if (alt.startsWith("~")) {
      const code = norm(alt.slice(1)).replace(/ /g, "");
      if (!code) return false;
      const words = codeWords(raw);
      if (words.some((w) => w.includes(code))) return true;
      return words.some((w, i) => i + 1 < words.length && (w + words[i + 1]).startsWith(code) && code.length > w.length);
    }
    const t = norm(alt);
    if (!t) return false;
    const escaped = t.replace(/[.*+?^${}()[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(title);
  });
}

/** Só as palavras obrigatórias e proibidas, sem olhar preço. */
export function titleMatches(product: Product, rawTitle: string): boolean {
  const title = norm(rawTitle);
  return (
    product.must.every((m) => hasTerm(title, m, rawTitle)) && !product.exclude.some((x) => hasTerm(title, x, rawTitle))
  );
}

export function matchesProduct(product: Product, offer: OfferInput): boolean {
  if (!offer.price || !Number.isFinite(offer.price)) return false;
  if (offer.price < Number(product.min_price || 0)) return false;
  if (product.max_price && offer.price > Number(product.max_price)) return false;
  return titleMatches(product, offer.title);
}

/** Filtra, remove duplicadas e mantém as N mais baratas por fonte/loja. */
export function selectOffers(product: Product, offers: OfferInput[], perStore = 3): OfferInput[] {
  const seen = new Set<string>();
  const byStore = new Map<string, number>();
  return offers
    .filter((o) => matchesProduct(product, o))
    .sort((a, b) => a.price - b.price)
    .filter((o) => {
      const key = `${o.source}:${o.externalId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      const storeKey = `${o.source}:${norm(o.store)}`;
      const n = byStore.get(storeKey) ?? 0;
      if (n >= perStore) return false;
      byStore.set(storeKey, n + 1);
      return true;
    });
}
