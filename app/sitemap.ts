import type { MetadataRoute } from "next";
import { getOverview } from "@/lib/data";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const products = await getOverview();
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/como-funciona`, changeFrequency: "monthly", priority: 0.3 },
    { url: `${base}/contato`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${base}/politica-de-privacidade`, changeFrequency: "yearly", priority: 0.1 },
    { url: `${base}/termos-de-uso`, changeFrequency: "yearly", priority: 0.1 },
    ...products.map((p) => ({
      url: `${base}/produto/${p.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
