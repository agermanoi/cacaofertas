import { readFile } from "fs/promises";
import { join } from "path";
import type { SiteSettings } from "./settings";

/** Utilitários das imagens de compartilhamento (Open Graph, 1200 × 630). */

export const OG_SIZE = { width: 1200, height: 630 };

let fontCache: Awaited<ReturnType<typeof loadFonts>> | null = null;

/** Nunito (WOFF, subconjunto latino com acentos) guardada em assets/fonts. */
async function loadFonts() {
  const dir = join(process.cwd(), "assets", "fonts");
  const out: { name: string; data: Buffer; weight: 700 | 900; style: "normal" }[] = [];
  for (const w of [700, 900] as const) {
    try {
      out.push({ name: "Nunito", data: await readFile(join(dir, `nunito-latin-${w}-normal.woff`)), weight: w, style: "normal" });
    } catch {
      /* sem a fonte, usa a padrão do gerador */
    }
  }
  return out;
}

/** Opções de fonte para o ImageResponse (vazio = fonte padrão). */
export async function ogFonts(): Promise<{ fonts?: Awaited<ReturnType<typeof loadFonts>> }> {
  fontCache ||= await loadFonts();
  return fontCache.length ? { fonts: fontCache } : {};
}

/** Imagem como data URI. Só PNG e JPEG (o gerador não lê WebP/AVIF). */
export async function imageData(src: string | null | undefined): Promise<string | null> {
  if (!src) return null;
  try {
    if (src.startsWith("/")) {
      const buf = await readFile(join(process.cwd(), "public", src));
      const type = src.endsWith(".png") ? "image/png" : "image/jpeg";
      return `data:${type};base64,${buf.toString("base64")}`;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    // pede JPEG/PNG explicitamente (CDNs de loja servem WebP para quem aceita)
    const res = await fetch(src, { signal: ctrl.signal, headers: { Accept: "image/jpeg,image/png;q=0.9" } });
    clearTimeout(t);
    const type = (res.headers.get("content-type") || "").split(";")[0];
    if (!res.ok || !/^image\/(png|jpe?g)$/.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 1_500_000) return null;
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export const VERDICT_COLORS: Record<string, { bg: string; fg: string }> = {
  record: { bg: "#E3F6E9", fg: "#146C2E" },
  below: { bg: "#E3F6E9", fg: "#146C2E" },
  normal: { bg: "#EEF0F3", fg: "#3B4553" },
  above: { bg: "#FFF3E0", fg: "#8A4B00" },
  fake: { bg: "#FDE7E7", fg: "#A11A1A" },
  learning: { bg: "#EEF0F3", fg: "#3B4553" },
  empty: { bg: "#EEF0F3", fg: "#3B4553" },
};

export function siteHost(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://cacaofertas.com.br").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** Moldura comum: faixa laranja embaixo com o endereço do site. */
export function Frame({ s, logo, children }: { s: SiteSettings; logo: string | null; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: s.colors.background,
        fontFamily: "Nunito",
        color: s.colors.ink,
      }}
    >
      <div style={{ display: "flex", flex: 1, padding: "48px 56px 32px" }}>{children}</div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: 76,
          padding: "0 56px",
          background: s.colors.primary,
          color: s.colors.ink,
          fontSize: 28,
          fontWeight: 900,
        }}
      >
        {logo ? (
          <div style={{ display: "flex", background: "#FFFFFF", borderRadius: 14, padding: "6px 16px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} height={44} style={{ height: 44 }} alt="" />
          </div>
        ) : (
          <span>{s.siteName}</span>
        )}
        <span>{siteHost()}</span>
      </div>
    </div>
  );
}
