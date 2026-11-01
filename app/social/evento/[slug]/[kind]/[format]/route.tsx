import { ImageResponse } from "next/og";
import { getOverview } from "@/lib/data";
import { getSettings } from "@/lib/settings";
import { imageData, ogFonts, siteHost } from "@/lib/og";
import { daysBetween, eventDeals, getPublicEvents, todayBR } from "@/lib/events";
import { publicClient } from "@/lib/supabase";

/**
 * Artes das datas do varejo:
 *   /social/evento/[slug]/contagem/feed|story  "Faltam 7 dias para o 11.11" + o preço para bater
 *   /social/evento/[slug]/vespera/feed|story   "Amanhã é 11.11" + o preço para bater
 *   /social/evento/[slug]/resumo/feed|story    "11.11: o que foi desconto de verdade"
 */
export const dynamic = "force-dynamic";

const SIZES = { feed: { width: 1080, height: 1350 }, story: { width: 1080, height: 1920 } } as const;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; kind: string; format: string }> }) {
  const { slug, kind, format } = await params;
  const fmt = format === "story" ? "story" : format === "feed" ? "feed" : null;
  if (!fmt || !["contagem", "vespera", "resumo"].includes(kind)) return new Response("Não encontrado", { status: 404 });
  const ev = (await getPublicEvents()).find((e) => e.slug === slug);
  if (!ev) return new Response("Data não encontrada", { status: 404 });

  const [s, fonts, products] = await Promise.all([getSettings(), ogFonts(), getOverview()]);
  const story = fmt === "story";
  const max = story ? 5 : 4;

  type Row = { name: string; img: string | null; line: string; tag?: string };
  let rows: Row[] = [];
  const daysLeft = daysBetween(todayBR(), ev.date);
  if (kind === "vespera" || kind === "contagem") {
    const top = products
      .slice()
      .sort((a, b) => Number(Boolean(b.image_url)) - Number(Boolean(a.image_url)) || b.popularity - a.popularity)
      .slice(0, max);
    const imgs = await Promise.all(top.map((p) => imageData(p.image_url)));
    rows = top.map((p, i) => ({
      name: p.name,
      img: imgs[i],
      line: `Hoje ${brl(Number(p.best_price))}${p.min_all != null ? ` · menor já visto ${brl(Number(p.min_all))}` : ""}`,
    }));
  } else {
    const deals = (await eventDeals(publicClient(), ev, products)).filter((d) => d.pct >= 0.05).slice(0, max);
    const imgs = await Promise.all(deals.map((d) => imageData(d.p.image_url)));
    rows = deals.map((d, i) => ({
      name: d.p.name,
      img: imgs[i],
      line: `${brl(d.price)} · média ${brl(d.avg)}`,
      tag: `−${Math.round(d.pct * 100)}%`,
    }));
  }
  const [logo, mascot] = await Promise.all([imageData(s.logoUrl), imageData("/brand/mascote.png")]);
  const title =
    kind === "contagem"
      ? daysLeft === 1
        ? "Falta 1 dia"
        : `Faltam ${daysLeft} dias`
      : kind === "vespera"
        ? `Amanhã é ${ev.name}`
        : `${ev.name}: desconto de verdade`;
  const sub =
    kind === "contagem"
      ? `para ${ev.article} ${ev.name}. O preço para bater: quanto custa hoje e o menor preço que já vimos.`
      : kind === "vespera"
      ? "O preço para bater: quanto custa hoje e o menor preço que já vimos."
      : rows.length
        ? "Preço na data comparado com a média dos 30 dias anteriores."
        : "Nenhum produto que acompanhamos ficou 5% ou mais abaixo da média. Desconto de verdade foi raro.";
  const short = (t: string) => (t.length > 46 ? `${t.slice(0, 44)}…` : t);

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
            {ev.name.toUpperCase()}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            marginTop: story ? 56 : 34,
            background: "#FFFFFF",
            borderRadius: 40,
            padding: story ? "60px 52px" : "44px 48px",
          }}
        >
          <div style={{ display: "flex", fontSize: story ? 84 : 76, fontWeight: 900, lineHeight: 1.05 }}>{title}</div>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#3B4553", marginTop: 14, lineHeight: 1.25 }}>{sub}</div>

          <div style={{ display: "flex", flexDirection: "column", marginTop: story ? 44 : 30, gap: story ? 24 : 18 }}>
            {rows.map((r) => (
              <div
                key={r.name}
                style={{ display: "flex", alignItems: "center", borderTop: "2px solid #EEF0F3", paddingTop: story ? 22 : 16 }}
              >
                <div style={{ display: "flex", width: 120, height: 120, alignItems: "center", justifyContent: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.img ? <img src={r.img} alt="" style={{ maxWidth: 120, maxHeight: 120, objectFit: "contain" }} /> : null}
                </div>
                <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 24 }}>
                  <div style={{ display: "flex", fontSize: 34, fontWeight: 900, lineHeight: 1.1 }}>{short(r.name)}</div>
                  <div style={{ display: "flex", fontSize: 27, fontWeight: 700, color: "#3B4553", marginTop: 6 }}>{r.line}</div>
                </div>
                {r.tag ? (
                  <div
                    style={{
                      display: "flex",
                      background: "#146C2E",
                      color: "#FFFFFF",
                      fontSize: 34,
                      fontWeight: 900,
                      padding: "8px 18px",
                      borderRadius: 16,
                      marginLeft: 16,
                    }}
                  >
                    {r.tag}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div style={{ display: "flex", flex: 1 }} />
          {!rows.length && mascot ? (
            <div style={{ display: "flex", justifyContent: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mascot} alt="" style={{ height: 320, objectFit: "contain" }} />
            </div>
          ) : null}
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
          <span>
            {kind === "contagem" ? "Siga para não perder" : kind === "vespera" ? "Amanhã: os descontos reais" : "Lista completa no link da bio"}
          </span>
          <span>{siteHost()}</span>
        </div>
      </div>
    ),
    { ...SIZES[fmt], ...fonts, headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } }
  );
}
