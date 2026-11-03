import { ImageResponse } from "next/og";
import { getSettings } from "@/lib/settings";
import { imageData, ogFonts } from "@/lib/og";
import { HOUSE_SIZES, houseProducts, type HouseSize } from "@/lib/house-ads";

/**
 * Versão em imagem (PNG) do anúncio da casa, para criativo de imagem do GAM.
 * /ads/house/970x250/image, /ads/house/300x250/image (?x=2 para o dobro da resolução).
 */
export const dynamic = "force-dynamic";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function GET(req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  const conf = HOUSE_SIZES[size as HouseSize];
  if (!conf) return new Response("Tamanho inválido", { status: 404 });
  const x = new URL(req.url).searchParams.get("x") === "2" ? 2 : 1;
  const [s, fonts, items] = await Promise.all([getSettings(), ogFonts(), houseProducts(size === "970x250" ? conf.n : 1)]);
  const [logo, ...imgs] = await Promise.all([imageData(s.logoUrl), ...items.map((i) => imageData(i.p.image_url))]);
  const P = s.colors.primary;
  const INK = s.colors.ink;
  const u = (n: number) => n * x;
  const short = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

  const Card = ({ k, wide }: { k: number; wide?: boolean }) => {
    const i = items[k];
    return (
      <div
        style={{
          display: "flex",
          flexDirection: wide ? "row" : "column",
          flex: 1,
          background: "#FFFFFF",
          borderRadius: u(14),
          overflow: "hidden",
          marginLeft: k && !wide ? u(12) : 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: wide ? "100%" : u(110), width: wide ? u(120) : "100%", padding: u(8) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {imgs[k] ? <img src={imgs[k]!} alt="" style={{ maxWidth: wide ? u(104) : u(170), maxHeight: wide ? u(130) : u(94), objectFit: "contain" }} /> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", padding: wide ? `${u(10)}px ${u(10)}px ${u(10)}px 0` : `${u(6)}px ${u(10)}px ${u(10)}px`, flex: 1, justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: u(13), fontWeight: 700, lineHeight: 1.2 }}>{short(i.p.name, wide ? 60 : 44)}</div>
          <div style={{ display: "flex", fontSize: u(wide ? 22 : 20), fontWeight: 900, marginTop: u(4) }}>{brl(Number(i.p.best_price))}</div>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              marginTop: u(4),
              fontSize: u(10.5),
              fontWeight: 900,
              padding: `${u(2)}px ${u(8)}px`,
              borderRadius: 999,
              background: i.v.kind === "record" || i.v.kind === "below" ? "#E3F6E9" : "#EEF0F3",
              color: i.v.kind === "record" || i.v.kind === "below" ? "#146C2E" : "#3B4553",
            }}
          >
            {i.badge.toUpperCase()}
          </div>
        </div>
      </div>
    );
  };

  const Logo = ({ h }: { h: number }) =>
    logo ? (
      <div style={{ display: "flex", background: "#FFFFFF", borderRadius: u(10), padding: `${u(4)}px ${u(10)}px`, alignSelf: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" height={u(h)} style={{ height: u(h) }} />
      </div>
    ) : (
      <div style={{ display: "flex", fontSize: u(22), fontWeight: 900 }}>{s.siteName}</div>
    );

  const Cta = ({ t, fs }: { t: string; fs: number }) => (
    <div style={{ display: "flex", alignSelf: "flex-start", background: INK, color: "#FFFFFF", fontWeight: 900, fontSize: u(fs), padding: `${u(7)}px ${u(14)}px`, borderRadius: 999 }}>{t}</div>
  );

  let node: React.ReactElement;
  if (size === "970x250") {
    node = (
      <div style={{ display: "flex", width: "100%", height: "100%", background: P, padding: u(16), fontFamily: "Nunito", color: INK }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", width: u(250), marginRight: u(14) }}>
          <Logo h={30} />
          <div style={{ display: "flex", fontSize: u(24), fontWeight: 900, lineHeight: 1.1, marginTop: u(10) }}>Desconto de verdade ou metade do dobro?</div>
          <div style={{ display: "flex", fontSize: u(14), fontWeight: 700, marginTop: u(6) }}>Veja o histórico de preço antes de comprar.</div>
          <div style={{ display: "flex", marginTop: u(10) }}>
            <Cta t="Ver ofertas de hoje ›" fs={14} />
          </div>
        </div>
        <div style={{ display: "flex", flex: 1 }}>
          {items.map((_, k) => (
            <Card key={k} k={k} />
          ))}
        </div>
      </div>
    );
  } else if (size === "300x250") {
    node = (
      <div style={{ display: "flex", flexDirection: "column", width: "100%", height: "100%", background: P, padding: u(10), fontFamily: "Nunito", color: INK }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Logo h={22} />
          <div style={{ display: "flex", background: INK, color: "#FFFFFF", fontWeight: 900, fontSize: u(10.5), padding: `${u(4)}px ${u(9)}px`, borderRadius: 999 }}>OFERTA DE HOJE</div>
        </div>
        <div style={{ display: "flex", flex: 1, marginTop: u(8), marginBottom: u(8) }}>{items.length ? <Card k={0} wide /> : null}</div>
        <div style={{ display: "flex", justifyContent: "center", background: INK, color: "#FFFFFF", fontWeight: 900, fontSize: u(13), padding: u(8), borderRadius: 999 }}>
          Ver histórico de preço ›
        </div>
      </div>
    );
  } else {
    const tiny = conf.h <= 50;
    const i = items[0];
    const good = i && (i.v.kind === "record" || i.v.kind === "below");
    const boxH = conf.h - (tiny ? 8 : 14);
    const imgS = Math.min(conf.h - (tiny ? 12 : 22), conf.w <= 320 ? 64 : 999);
    node = (
      <div style={{ display: "flex", alignItems: "center", width: "100%", height: "100%", background: P, padding: `0 ${u(conf.w > 320 ? 10 : tiny ? 4 : 8)}px`, fontFamily: "Nunito", color: INK }}>
        {conf.w > 320 ? <div style={{ display: "flex", marginRight: u(10) }}><Logo h={26} /></div> : null}
        <div style={{ display: "flex", flex: 1, alignItems: "center", height: u(boxH), background: "#FFFFFF", borderRadius: u(tiny ? 8 : 12), padding: `0 ${u(tiny ? 6 : 10)}px 0 ${u(4)}px`, marginRight: u(tiny ? 6 : 10) }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: u(imgS), height: u(imgS), marginRight: u(8) }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {imgs[0] ? <img src={imgs[0]!} alt="" style={{ maxWidth: u(imgS), maxHeight: u(imgS), objectFit: "contain" }} /> : null}
          </div>
          {i ? (
            <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
              <div style={{ display: "flex", fontSize: u(tiny ? 11 : 13), fontWeight: 700, lineHeight: 1.15 }}>{short(i.p.name, tiny ? 30 : conf.w > 320 ? 70 : 44)}</div>
              <div style={{ display: "flex", alignItems: "center", marginTop: u(tiny ? 0 : 3) }}>
                <div style={{ display: "flex", fontSize: u(tiny ? 15 : 19), fontWeight: 900 }}>{brl(Number(i.p.best_price))}</div>
                {conf.w > 320 ? (
                  <div style={{ display: "flex", marginLeft: u(6), fontSize: u(9.5), fontWeight: 900, padding: `${u(2)}px ${u(7)}px`, borderRadius: 999, background: good ? "#E3F6E9" : "#EEF0F3", color: good ? "#146C2E" : "#3B4553" }}>
                    {short(i.badge.toUpperCase(), conf.w > 320 ? 30 : 18)}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", background: INK, color: "#FFFFFF", fontWeight: 900, fontSize: u(tiny ? 12 : 13), padding: tiny ? `${u(6)}px ${u(10)}px` : `${u(8)}px ${u(14)}px`, borderRadius: 999 }}>
          {conf.w <= 320 ? "Ver ›" : "Ver ofertas ›"}
        </div>
      </div>
    );
  }

  return new ImageResponse(node, { width: conf.w * x, height: conf.h * x, ...fonts, headers: { "Cache-Control": "public, s-maxage=600", "X-Robots-Tag": "noindex" } });
}
