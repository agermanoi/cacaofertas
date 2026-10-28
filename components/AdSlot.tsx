/**
 * Espaço reservado para anúncio. Só a div: plugue GPT, AdSense, Prebid ou seu ad server
 * usando o id (ex.: googletag.defineSlot('/1234/radar/home-topo', sizes, 'ad-home-topo')).
 *
 * - A altura mínima fica reservada para não causar CLS (pulo de layout).
 * - data-sizes-desktop / data-sizes-mobile documentam os formatos previstos.
 * - NEXT_PUBLIC_ADS=off remove todos os espaços.
 * - NEXT_PUBLIC_ADS_DEBUG=1 mostra o contorno e o nome de cada slot.
 */

export type AdFormat = "leaderboard" | "retangulo" | "infeed" | "rodape";

const FORMATS: Record<AdFormat, { desktop: string; mobile: string }> = {
  // 970x90 / 728x90 no desktop, 320x50 / 320x100 no celular
  leaderboard: { desktop: "970x90,728x90", mobile: "320x100,320x50" },
  // 300x250 em qualquer tela (336x280 no desktop)
  retangulo: { desktop: "336x280,300x250", mobile: "300x250" },
  // entre as linhas do catálogo: faixa no desktop, retângulo no celular
  infeed: { desktop: "728x90,fluid", mobile: "300x250,fluid" },
  // antes do rodapé
  rodape: { desktop: "970x250,970x90,728x90", mobile: "300x250,320x100" },
};

export function AdSlot({ id, format, className }: { id: string; format: AdFormat; className?: string }) {
  if (process.env.NEXT_PUBLIC_ADS === "off") return null;
  const f = FORMATS[format];
  const debug = process.env.NEXT_PUBLIC_ADS_DEBUG === "1";
  return (
    <aside
      className={`ad ad-${format}${debug ? " ad-debug" : ""}${className ? ` ${className}` : ""}`}
      aria-label="Publicidade"
    >
      <span className="ad-label">Publicidade</span>
      <div
        id={`ad-${id}`}
        className="ad-slot"
        data-ad-slot={id}
        data-ad-format={format}
        data-sizes-desktop={f.desktop}
        data-sizes-mobile={f.mobile}
      >
        {debug ? (
          <span className="ad-debug-info">
            #{`ad-${id}`} · desktop {f.desktop} · mobile {f.mobile}
          </span>
        ) : null}
      </div>
    </aside>
  );
}
