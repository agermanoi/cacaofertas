/** "Smart TV Samsung 55\" Crystal" -> "smart-tv-samsung-55-crystal" */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Lista separada por vírgula ou quebra de linha, sem vazios nem repetidos. */
export function parseList(s: string | null | undefined): string[] {
  return Array.from(
    new Set(
      String(s || "")
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean)
    )
  );
}
