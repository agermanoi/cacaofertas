import { ImageResponse } from "next/og";
import { getProductBySlug } from "@/lib/data";
import { verdictFor } from "@/lib/verdict";
import { getSettings } from "@/lib/settings";
import { imageData, ogFonts, siteHost } from "@/lib/og";
import { atStore } from "@/lib/social";

/**
 * Arte dos posts do Instagram/Facebook.
 *   /social/[slug]/feed   1080 × 1350 (retrato 4:5, o maior espaço no feed)
 *   /social/[slug]/story  1080 × 1920
 * Sai em PNG; a publicação converte para JPEG (exigência do Instagram).
 */
export const dynamic = "force-dynamic";

const SIZES = { feed: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } } as const;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; format: string }> }) {
  const { slug, format } = await params;
  const fmt = format === "story" ? "story" : format === "feed" ? "feed" : null;
  if (!fmt) return new Response("Formato inválido", { status: 404 });
  const p = await getProductBySlug(slug);
  if (!p || p.best_price == null) return new Response("Produto sem preço", { status: 404 });

  const [s, fonts] = await Promise.all([getSettings(), ogFonts()]);
  const [logo, photo, mascot] = await Promise.all([imageData(s.logoUrl), imageData(p.image_url), imageData("/brand/mascote.png")]);
  const size = SIZES[fmt];
  const story = fmt === "story";

  const v = verdictFor(p);
  const price = Number(p.best_price);
  const list = p.best_list_price != null ? Number(p.best_list_price) : null;
  const showList = list != null && list > price * 1.02 && v.kind !== "fake";
  const badge =
    v.kind === "record"
      ? "MENOR PREÇO JÁ VISTO"
      : v.kind === "below"
        ? `${Math.round((v.vsAvg || 0) * 100)}% ABAIXO DA MÉDIA`
        : "MENOR PREÇO DE HOJE";
  const good = v.kind === "record" || v.kind === "below";
  const name = p.name.length > 80 ? `${p.name.slice(0, 78)}…` : p.name;
  const nameSize = name.length > 55 ? 50 : name.length > 32 ? 58 : 66;
  const photoH = story ? 820 : 600;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: s.colors.primary,
          fontFamily: "Nunito",
          color: s.colors.ink,
          padding: story ? "120px 64px 110px" : "44px 56px 40px",
        }}
      >
        {/* topo: logo + selo */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {logo ? (
            <div style={{ display: "flex", background: "#FFFFFF", borderRadius: 18, padding: "10px 22px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} height={56} style={{ height: 56 }} alt="" />
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 44, fontWeight: 900 }}>{s.siteName}</div>
          )}
          <div
            style={{
              display: "flex",
              background: good ? "#146C2E" : s.colors.ink,
              color: "#FFFFFF",
              fontSize: 30,
              fontWeight: 900,
              padding: "12px 24px",
              borderRadius: 999,
            }}
          >
            {badge}
          </div>
        </div>

        {/* cartão branco */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            marginTop: story ? 56 : 34,
            background: "#FFFFFF",
            borderRadius: 40,
            padding: story ? "56px 56px 52px" : "40px 48px 40px",
          }}
        >
          <div style={{ display: "flex", height: photoH, alignItems: "center", justifyContent: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo ? (
              <img src={photo} alt="" style={{ maxWidth: 880, maxHeight: photoH, objectFit: "contain" }} />
            ) : mascot ? (
              <img src={mascot} alt="" style={{ maxWidth: 520, maxHeight: photoH * 0.7, objectFit: "contain" }} />
            ) : null}
          </div>

          <div style={{ display: "flex", flex: 1 }} />

          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#5B6573", marginTop: 20 }}>{p.category}</div>
          <div style={{ display: "flex", fontSize: nameSize, fontWeight: 900, lineHeight: 1.08, marginTop: 6 }}>{name}</div>

          <div style={{ display: "flex", alignItems: "flex-end", marginTop: story ? 40 : 26 }}>
            <div
              style={{
                display: "flex",
                background: s.colors.primary,
                color: s.colors.ink,
                fontSize: story ? 112 : 96,
                fontWeight: 900,
                padding: "2px 30px",
                borderRadius: 24,
                lineHeight: 1.15,
              }}
            >
              {brl(price)}
            </div>
            {showList ? (
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 24, marginBottom: 10 }}>
                <div style={{ display: "flex", fontSize: 32, color: "#5B6573", textDecoration: "line-through" }}>{brl(list!)}</div>
                <div style={{ display: "flex", fontSize: 32, fontWeight: 900, color: "#146C2E" }}>
                  {`−${Math.round((1 - price / list!) * 100)}%`}
                </div>
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#3B4553", marginTop: 14 }}>
            {p.best_store ? atStore(p.best_store) : "menor preço entre as lojas"}
            {good && v.detail ? ` · ${v.detail.replace(/\.$/, "")}` : ""}
          </div>
        </div>

        {/* rodapé */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: story ? 48 : 30,
            fontSize: story ? 40 : 34,
            fontWeight: 900,
          }}
        >
          <span>{story ? "Toque no link da bio" : "Link na bio"}</span>
          <span>{siteHost()}</span>
        </div>
      </div>
    ),
    { ...size, ...fonts, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
  );
}
