import { ImageResponse } from "next/og";
import { publicClient } from "@/lib/supabase";
import { getSettings } from "@/lib/settings";
import { imageData, ogFonts, siteHost } from "@/lib/og";
import { validity } from "@/lib/social";

/**
 * Arte dos posts de cupom.
 *   /social/cupom/[id]/feed   1080 × 1350
 *   /social/cupom/[id]/story  1080 × 1920
 */
export const dynamic = "force-dynamic";

const SIZES = { feed: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } } as const;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; format: string }> }) {
  const { id, format } = await params;
  const fmt = format === "story" ? "story" : format === "feed" ? "feed" : null;
  if (!fmt || !/^[0-9a-f-]{36}$/i.test(id)) return new Response("Não encontrado", { status: 404 });

  const { data: c } = await publicClient()
    .from("coupons")
    .select("id,store,title,code,discount,expires_at")
    .eq("id", id)
    .maybeSingle();
  if (!c?.code) return new Response("Cupom indisponível", { status: 404 });

  const [s, fonts] = await Promise.all([getSettings(), ogFonts()]);
  const [logo, mascot] = await Promise.all([imageData(s.logoUrl), imageData("/brand/mascote.png")]);
  const story = fmt === "story";
  const title = String(c.title).replace(/\s+/g, " ").trim();
  const shortTitle = title.length > 90 ? `${title.slice(0, 88)}…` : title;
  const store = String(c.store);
  const storeSize = store.length > 22 ? 56 : store.length > 14 ? 68 : 80;
  const code = String(c.code).toUpperCase();
  const codeSize = code.length > 14 ? 62 : code.length > 10 ? 78 : 96;
  const discount = c.discount ? String(c.discount).toUpperCase() : "CUPOM";
  const discSize = discount.length > 9 ? 120 : 160;

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
              background: s.colors.ink,
              color: "#FFFFFF",
              fontSize: 30,
              fontWeight: 900,
              padding: "12px 24px",
              borderRadius: 999,
            }}
          >
            CUPOM DE DESCONTO
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            flex: 1,
            marginTop: story ? 56 : 34,
            background: "#FFFFFF",
            borderRadius: 40,
            padding: story ? "72px 56px 60px" : "48px 52px 44px",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", fontSize: storeSize, fontWeight: 900, lineHeight: 1.05 }}>{store}</div>
          <div
            style={{
              display: "flex",
              fontSize: discSize,
              fontWeight: 900,
              color: s.colors.primary,
              lineHeight: 1,
              marginTop: story ? 40 : 22,
            }}
          >
            {discount}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 700,
              color: "#3B4553",
              lineHeight: 1.2,
              marginTop: story ? 36 : 22,
              maxWidth: 880,
              justifyContent: "center",
            }}
          >
            {shortTitle}
          </div>

          <div style={{ display: "flex", flex: 1 }} />

          {mascot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mascot} alt="" style={{ height: story ? 300 : 240, objectFit: "contain", marginBottom: 18 }} />
          ) : null}

          <div style={{ display: "flex", fontSize: 28, fontWeight: 900, color: "#5B6573", letterSpacing: 4 }}>USE O CÓDIGO</div>
          <div
            style={{
              display: "flex",
              marginTop: 12,
              padding: "14px 44px",
              border: `6px dashed ${s.colors.primary}`,
              borderRadius: 24,
              background: "#FFF7EE",
              fontSize: codeSize,
              fontWeight: 900,
              letterSpacing: 3,
            }}
          >
            {code}
          </div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#3B4553", marginTop: 20 }}>
            {validity(c.expires_at)}
          </div>
        </div>

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
          <span>{story ? "Toque no link da bio" : "Mais cupons no link da bio"}</span>
          <span>{siteHost()}</span>
        </div>
      </div>
    ),
    { ...SIZES[fmt], ...fonts, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
  );
}
