export type Source = "mercadolivre" | "serpapi" | "lomadee" | "scraper";

export interface Product {
  id: string;
  slug: string;
  name: string;
  category: string;
  query: string;
  must: string[];
  exclude: string[];
  min_price: number;
  max_price: number | null;
  scrape_urls: string[];
  image_url: string | null;
  popularity: number;
  active: boolean;
  specs?: ProductSpecs | null;
  updated_at?: string;
}

export interface ProductSpecs {
  summary: string;
  specs: [string, string][];
  note?: string;
}

/** O que cada coletor devolve. */
export interface OfferInput {
  source: Source;
  store: string;
  externalId: string;
  title: string;
  url: string;
  affiliateUrl?: string | null;
  imageUrl?: string | null;
  price: number;
  listPrice?: number | null;
  /** usado internamente (Lomadee precisa para gerar o link de afiliado) */
  meta?: Record<string, string>;
}

export interface Collector {
  source: Source;
  enabled(): boolean;
  collect(product: Product): Promise<OfferInput[]>;
  /** Nomes que a fonte devolveu e o filtro recusou, por slug (para calibrar must/exclude). */
  rejected?: Record<string, string[]>;
}

export interface ProductOverview {
  id: string;
  slug: string;
  name: string;
  category: string;
  image_url: string | null;
  popularity: number;
  active: boolean;
  best_price: number | null;
  best_list_price: number | null;
  best_offer_id: string | null;
  best_store: string | null;
  offers_count: number | null;
  min_30d: number | null;
  avg_30d: number | null;
  max_30d: number | null;
  min_90d: number | null;
  min_all: number | null;
  days_tracked: number | null;
  specs?: ProductSpecs | null;
  query?: string;
  must?: string[];
  exclude?: string[];
  min_price?: number;
  max_price?: number | null;
  scrape_urls?: string[];
  updated_at?: string;
}

export interface OfferRow {
  id: string;
  product_id: string;
  source: Source;
  store: string;
  title: string;
  url: string;
  affiliate_url: string | null;
  image_url: string | null;
  last_price: number | null;
  last_list_price: number | null;
  last_seen_at: string;
}

export interface DailyPoint {
  day: string;
  min_price: number;
}
