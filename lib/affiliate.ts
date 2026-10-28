/**
 * Transforma a URL da loja em link de afiliado.
 *
 * Configurações por variável de ambiente:
 *  AMAZON_ASSOCIATE_TAG   -> adiciona ?tag=SEU-TAG-20 nos links da Amazon
 *  AFFILIATE_TEMPLATES    -> JSON { "dominio.com.br": "https://deeplink...{url}" }
 *                            {url} recebe a URL da loja codificada; {raw} sem codificar.
 *                            Serve para deep links da Awin, Rakuten, Lomadee etc.
 *  AFFILIATE_DEFAULT      -> template usado quando nenhum domínio bate (opcional)
 */

let templatesCache: Record<string, string> | null = null;

function templates(): Record<string, string> {
  if (templatesCache) return templatesCache;
  try {
    templatesCache = JSON.parse(process.env.AFFILIATE_TEMPLATES || "{}");
  } catch {
    console.warn("[affiliate] AFFILIATE_TEMPLATES não é um JSON válido");
    templatesCache = {};
  }
  return templatesCache!;
}

function apply(template: string, url: string): string {
  return template.replace("{url}", encodeURIComponent(url)).replace("{raw}", url);
}

export function toAffiliate(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }

  const tag = process.env.AMAZON_ASSOCIATE_TAG;
  if (tag && /(^|\.)amazon\.com\.br$/.test(host)) {
    const u = new URL(url);
    u.searchParams.set("tag", tag);
    return u.toString();
  }

  const t = templates();
  const key = Object.keys(t).find((d) => host === d || host.endsWith(`.${d}`));
  if (key) return apply(t[key], url);

  if (process.env.AFFILIATE_DEFAULT) return apply(process.env.AFFILIATE_DEFAULT, url);
  return null;
}

/** Nome amigável da loja a partir do domínio. */
const STORE_NAMES: Record<string, string> = {
  "amazon.com.br": "Amazon",
  "mercadolivre.com.br": "Mercado Livre",
  "magazineluiza.com.br": "Magalu",
  "magalu.com": "Magalu",
  "kabum.com.br": "KaBuM!",
  "casasbahia.com.br": "Casas Bahia",
  "pontofrio.com.br": "Ponto",
  "extra.com.br": "Extra",
  "americanas.com.br": "Americanas",
  "carrefour.com.br": "Carrefour",
  "fastshop.com.br": "Fast Shop",
  "shopee.com.br": "Shopee",
  "samsung.com": "Samsung",
  "apple.com": "Apple",
  "terabyteshop.com.br": "Terabyte",
  "pichau.com.br": "Pichau",
  "girafa.com.br": "Girafa",
  "submarino.com.br": "Submarino",
};

export function storeFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    const key = Object.keys(STORE_NAMES).find((d) => host === d || host.endsWith(`.${d}`));
    if (key) return STORE_NAMES[key];
    const base = host.split(".")[0];
    return base.charAt(0).toUpperCase() + base.slice(1);
  } catch {
    return "Loja";
  }
}

/**
 * Lojas que não entram no comparador: usados/recondicionados, marketplaces
 * estrangeiros e programas de pontos (preço não é em reais à vista).
 */
const BLOCKED_STORES = [
  /enjoei/i, /\bolx\b/i, /trocafy/i, /usado/i, /troca ?game/i, /^ebay/i, /aliexpress/i,
  /latam ?pass/i, /livelo/i, /smiles/i, /esfera/i, /recondicionad/i, /seminovo/i, /refurb/i,
];

export function isBlockedStore(name: string): boolean {
  return BLOCKED_STORES.some((r) => r.test(name));
}

/** Unifica variações do nome da mesma loja ("Amazon.com.br - Seller" → "Amazon"). */
const STORE_ALIASES: [RegExp, string][] = [
  [/^amazon/i, "Amazon"],
  [/^mercado ?livre|^mercadolivre/i, "Mercado Livre"],
  [/^shopee/i, "Shopee"],
  [/^magalu|^magazine ?luiza/i, "Magalu"],
  [/^americanas/i, "Americanas"],
  [/^ponto ?frio|^pontofrio|^ponto$/i, "Ponto"],
  [/^casas ?bahia/i, "Casas Bahia"],
  [/^kabum/i, "KaBuM!"],
  [/^carrefour/i, "Carrefour"],
  [/^extra(\.com)?/i, "Extra"],
  [/^fast ?shop/i, "Fast Shop"],
];

export function normalizeStore(name: string): string {
  const n = name.trim();
  for (const [r, v] of STORE_ALIASES) if (r.test(n)) return v;
  return n;
}
