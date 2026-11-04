import { siteUrl } from "@/lib/site";
import { categorySlug } from "@/lib/categories";
import type { MetadataRoute } from "next";
import { getOverview } from "@/lib/data";
import { getPublicEvents } from "@/lib/events";
import { liveGuides } from "@/lib/guides";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const products = await getOverview();
  const events = (await getPublicEvents()).filter((e) => e.page);
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/cupons`, changeFrequency: "daily", priority: 0.7 },
    { url: `${base}/hoje`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/como-funciona`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/contato`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/politica-de-privacidade`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/termos-de-uso`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/mapa-do-site`, changeFrequency: "weekly", priority: 0.3 },
    { url: `${base}/datas`, changeFrequency: "weekly", priority: 0.5 },
    { url: `${base}/precos`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    ...liveGuides(products).map((g) => ({ url: `${base}/precos/${g.guide.slug}`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.9 })),
    ...events.map((e) => ({ url: `${base}/datas/${e.slug}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...[...new Set(products.map((p) => p.category))].map((c) => ({
      url: `${base}/categoria/${categorySlug(c)}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    ...products.map((p) => ({
      url: `${base}/produto/${p.slug}`,
      lastModified: new Date(),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
