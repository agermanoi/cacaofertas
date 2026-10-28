import { ImageResponse } from "next/og";
import { getOverview } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { categoryInfo, categorySlug } from "@/lib/categories";
import { Frame, OG_SIZE, imageData, ogFonts } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Ofertas da categoria na Black Friday";
export const revalidate = 3600;

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [all, s, fonts] = await Promise.all([getOverview(), getSettings(), ogFonts()]);
  const products = all.filter((p) => categorySlug(p.category) === slug);
  const name = products[0]?.category || "Ofertas";
  const info = categoryInfo(name);
  const prices = products.map((p) => p.best_price).filter((x) => x != null).map(Number);
  const min = prices.length ? Math.min(...prices) : null;
  const [logo, mascot] = await Promise.all([imageData(s.logoUrl), imageData("/brand/mascote.png")]);

  return new ImageResponse(
    (
      <Frame s={s} logo={logo}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", fontSize: 28, fontWeight: 700, color: "#5B6573" }}>Black Friday {new Date().getFullYear()}</div>
          <div style={{ display: "flex", fontSize: 70, fontWeight: 900, lineHeight: 1.05, marginTop: 10 }}>{info.title}</div>
          <div style={{ display: "flex", flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700 }}>
            {products.length} produtos com histórico de preço
          </div>
          {min != null ? (
            <div style={{ display: "flex", alignItems: "center", marginTop: 14 }}>
              <span style={{ fontSize: 30, fontWeight: 700, color: "#5B6573", marginRight: 16 }}>a partir de</span>
              <span
                style={{
                  display: "flex",
                  background: s.colors.primary,
                  color: s.colors.ink,
                  fontSize: 60,
                  fontWeight: 900,
                  padding: "2px 22px",
                  borderRadius: 16,
                }}
              >
                {brl(min)}
              </span>
            </div>
          ) : null}
        </div>
        {mascot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mascot} alt="" width={340} height={256} style={{ alignSelf: "flex-end", width: 340, height: 256 }} />
        ) : null}
      </Frame>
    ),
    { ...size, ...fonts }
  );
}
