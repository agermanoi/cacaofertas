import type { MetadataRoute } from "next";
import { getOverview } from "@/lib/data";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const products = await getOverview();
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/como-funciona`, changeFrequency: "monthly", priority: 0.3 },
    ...products.map((p) => ({
      url: `${base}/produto/${p.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
  ];
}
