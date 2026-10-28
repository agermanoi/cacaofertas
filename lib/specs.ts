import specsData from "@/data/specs.json";
import type { ProductSpecs } from "./types";

export type { ProductSpecs };

const FILE_SPECS = specsData as unknown as Record<string, ProductSpecs>;

function valid(s: unknown): s is ProductSpecs {
  const v = s as ProductSpecs | null;
  return Boolean(v && typeof v.summary === "string" && Array.isArray(v.specs) && (v.summary || v.specs.length));
}

/**
 * Ficha técnica do produto: a do banco (editada no /admin) tem prioridade;
 * sem ela, usa data/specs.json pelo slug.
 */
export function getSpecs(slug: string, fromDb?: unknown): ProductSpecs | null {
  if (valid(fromDb)) return fromDb;
  return FILE_SPECS[slug] ?? null;
}

/** "Rótulo: valor" por linha  ->  [["Rótulo","valor"], ...] */
export function parseSpecLines(text: string): [string, string][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const i = l.indexOf(":");
      return i > 0 ? ([l.slice(0, i).trim(), l.slice(i + 1).trim()] as [string, string]) : (["", l] as [string, string]);
    })
    .filter(([k, v]) => k && v);
}

export function specLinesToText(specs: [string, string][] | undefined): string {
  return (specs || []).map(([k, v]) => `${k}: ${v}`).join("\n");
}
