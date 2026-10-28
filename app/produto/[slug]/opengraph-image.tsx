import { ImageResponse } from "next/og";
import { getProductBySlug } from "@/lib/data";
import { verdictFor } from "@/lib/verdict";
import { getSettings } from "@/lib/settings";
import { Frame, OG_SIZE, VERDICT_COLORS, imageData, ogFonts } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Preço e histórico do produto";
export const revalidate = 3600;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [p, s, fonts] = await Promise.all([getProductBySlug(slug), getSettings(), ogFonts()]);
  const [logo, photo] = await Promise.all([imageData(s.logoUrl), imageData(p?.image_url)]);

  if (!p) {
    return new ImageResponse(
      (
        <Frame s={s} logo={logo}>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 900 }}>{s.siteName}</div>
        </Frame>
      ),
      { ...size, ...fonts }
    );
  }

  const v = verdictFor(p);
  const vc = VERDICT_COLORS[v.kind] || VERDICT_COLORS.normal;
  const price = p.best_price != null ? Number(p.best_price) : null;
  const list = p.best_list_price != null ? Number(p.best_list_price) : null;
  const name = p.name.length > 70 ? `${p.name.slice(0, 68)}…` : p.name;

  return new ImageResponse(
    (
      <Frame s={s} logo={logo}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: photo ? 32 : 0 }}>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#5B6573", marginBottom: 12 }}>
            {p.category} · histórico de preços
          </div>
          <div style={{ display: "flex", fontSize: name.length > 40 ? 52 : 62, fontWeight: 900, lineHeight: 1.08 }}>
            {name}
          </div>

          <div style={{ display: "flex", flex: 1 }} />

          {price != null ? (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", fontSize: 24, fontWeight: 700, color: "#5B6573" }}>
                {p.best_store ? `Menor preço hoje, na ${p.best_store}` : "Menor preço hoje"}
              </div>
              <div style={{ display: "flex", alignItems: "center", marginTop: 8 }}>
                <div
                  style={{
                    display: "flex",
                    background: s.colors.primary,
                    color: s.colors.ink,
                    fontSize: 72,
                    fontWeight: 900,
                    padding: "4px 26px",
                    borderRadius: 18,
                  }}
                >
                  {brl(price)}
                </div>
                {list && list > price ? (
                  <div style={{ display: "flex", marginLeft: 20, fontSize: 30, color: "#5B6573", textDecoration: "line-through" }}>
                    {brl(list)}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 36, fontWeight: 900 }}>Acompanhe o preço até a Black Friday</div>
          )}

          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              marginTop: 20,
              background: vc.bg,
              color: vc.fg,
              fontSize: 28,
              fontWeight: 900,
              padding: "8px 20px",
              borderRadius: 999,
            }}
          >
            {v.label}
          </div>
        </div>

        {photo ? (
          <div
            style={{
              display: "flex",
              width: 380,
              alignItems: "center",
              justifyContent: "center",
              background: "#FFFFFF",
              borderRadius: 24,
              padding: 24,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" style={{ maxWidth: 332, maxHeight: 400, objectFit: "contain" }} />
          </div>
        ) : null}
      </Frame>
    ),
    { ...size, ...fonts }
  );
}
