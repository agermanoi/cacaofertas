import * as cheerio from "cheerio";
import type { Collector, OfferInput, Product } from "../types";
import { http, parsePrice, sleep, BROWSER_UA } from "../http";
import { storeFromUrl, toAffiliate } from "../affiliate";

/**
 * Raspagem direta de páginas de produto.
 * Lê os dados estruturados (JSON-LD schema.org/Product) que a maioria das lojas
 * publica para o Google — bem mais estável que seletores de CSS.
 * As URLs ficam em products.scrape_urls (edite pelo Table Editor do Supabase).
 *
 * Observação: Amazon e algumas lojas bloqueiam robôs com frequência;
 * para elas prefira SerpAPI/afiliados. Respeite os termos de uso de cada loja.
 */

function findProductNode(node: any): any | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findProductNode(n);
      if (f) return f;
    }
    return null;
  }
  const type = node["@type"];
  if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return node;
  if (node["@graph"]) return findProductNode(node["@graph"]);
  return null;
}

function offerPrice(offers: any): { price: number | null; listPrice: number | null; available: boolean } {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  let best: number | null = null;
  let listPrice: number | null = null;
  let available = list.length === 0;
  for (const o of list) {
    const p = parsePrice(o.lowPrice ?? o.price ?? o.priceSpecification?.price);
    if (p && (best === null || p < best)) best = p;
    const hp = parsePrice(o.highPrice);
    if (hp && hp !== p) listPrice = Math.max(listPrice ?? 0, hp);
    const av = String(o.availability || "");
    if (!av || /InStock|LimitedAvailability|PreOrder/i.test(av)) available = true;
    if (Array.isArray(o.offers)) {
      const inner = offerPrice(o.offers);
      if (inner.price && (best === null || inner.price < best)) best = inner.price;
    }
  }
  return { price: best, listPrice, available };
}

export async function scrapeUrl(url: string): Promise<Omit<OfferInput, "source"> | null> {
  const res = await http(url, {
    headers: {
      "user-agent": BROWSER_UA,
      accept: "text/html,application/xhtml+xml",
      "accept-language": "pt-BR,pt;q=0.9",
    },
  });
  const html = await res.text();
  const $ = cheerio.load(html);

  let title = "";
  let price: number | null = null;
  let listPrice: number | null = null;
  let image: string | null = null;
  let available = true;

  $('script[type="application/ld+json"]').each((_, el) => {
    if (price) return;
    try {
      const node = findProductNode(JSON.parse($(el).contents().text()));
      if (!node) return;
      const op = offerPrice(node.offers);
      title = node.name || title;
      price = op.price;
      listPrice = op.listPrice;
      available = op.available;
      const img = Array.isArray(node.image) ? node.image[0] : node.image;
      image = typeof img === "string" ? img : img?.url ?? null;
    } catch {
      /* JSON-LD inválido: ignora */
    }
  });

  // Fallbacks: meta tags e microdata
  if (!price) {
    price =
      parsePrice($('meta[property="product:price:amount"]').attr("content")) ??
      parsePrice($('meta[itemprop="price"]').attr("content")) ??
      parsePrice($('[itemprop="price"]').first().attr("content") ?? $('[itemprop="price"]').first().text());
  }
  title = title || $('meta[property="og:title"]').attr("content") || $("title").text();
  image = image || $('meta[property="og:image"]').attr("content") || null;

  if (!price || !available) return null;
  return {
    store: storeFromUrl(url),
    externalId: url.split("?")[0],
    title: title.trim(),
    url,
    affiliateUrl: toAffiliate(url),
    imageUrl: image,
    price,
    listPrice: listPrice && listPrice > price ? listPrice : null,
  };
}

export function scraper(): Collector {
  return {
    source: "scraper",
    enabled: () => process.env.SCRAPER_ENABLED !== "false",
    async collect(product: Product): Promise<OfferInput[]> {
      const out: OfferInput[] = [];
      for (const url of product.scrape_urls || []) {
        try {
          const r = await scrapeUrl(url);
          // a URL foi escolhida a dedo: não aplicamos o filtro de título, só o de preço
          if (r) out.push({ ...r, source: "scraper", title: r.title || product.name });
        } catch (e) {
          console.warn(`  [scraper] ${url}: ${(e as Error).message}`);
        }
        await sleep(1500 + Math.random() * 1500);
      }
      return out;
    },
  };
}
