import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/settings";
import { Frame, OG_SIZE, imageData, ogFonts } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Histórico de preços para a Black Friday";
export const revalidate = 86400;

export default async function Image() {
  const [s, fonts] = await Promise.all([getSettings(), ogFonts()]);
  const [logo, mascot] = await Promise.all([imageData(s.logoUrl), imageData("/brand/mascote.png")]);
  return new ImageResponse(
    (
      <Frame s={s} logo={logo}>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#5B6573" }}>Black Friday {new Date().getFullYear()}</div>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 900, lineHeight: 1.04, marginTop: 12 }}>{s.heroTitle}</div>
          <div style={{ display: "flex", fontSize: 30, fontWeight: 700, marginTop: 24, color: "#3B4553" }}>{s.tagline}</div>
        </div>
        {mascot ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mascot} alt="" width={380} height={287} style={{ alignSelf: "center", width: 380, height: 287 }} />
        ) : null}
      </Frame>
    ),
    { ...size, ...fonts }
  );
}
