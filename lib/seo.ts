import { siteUrl } from "./site";

/** BreadcrumbList (JSON-LD) com URLs absolutas: aparece como trilha no resultado do Google. */
export function breadcrumbLd(items: { name: string; path: string }[]) {
  const base = siteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      item: `${base}${it.path}`,
    })),
  };
}

/** Mês e ano por extenso em português ("novembro de 2026"). */
export function monthYear(now = new Date()): string {
  return now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", month: "long", year: "numeric" });
}
