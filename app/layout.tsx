import { siteUrl } from "@/lib/site";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { countdownText, cssVars, getSettings } from "@/lib/settings";
import { BodyEndInjections, BodyStartInjections, HeadInjections } from "@/components/Injected";
import "./globals.css";

const SITE_URL = siteUrl();

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const customIcon = !s.iconUrl.startsWith("/brand/");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: `${s.siteName}: histórico de preços para a Black Friday`, template: `%s | ${s.siteName}` },
    description: `${s.tagline} Histórico de preços e menor preço atual dos produtos mais buscados na Black Friday.`,
    openGraph: { siteName: s.siteName, locale: "pt_BR", type: "website" },
    alternates: { canonical: "/" },
    // Ícone enviado pelo painel substitui o padrão (app/icon.png e app/apple-icon.png)
    ...(customIcon ? { icons: { icon: s.iconUrl, apple: s.iconUrl } } : {}),
    // Validação de sites parceiros (gera <meta name="lomadee" content="...">)
    verification: { other: { lomadee: process.env.NEXT_PUBLIC_LOMADEE_VERIFICATION || "2324685" } },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const s = await getSettings();
  return { themeColor: s.colors.primary };
}

/** Configuração do Google Ad Manager para os AdSlots (não roda no painel). */
function gptInit(g: { networkCode: string; parentAdUnit: string; childUnits: boolean; lazyLoad: boolean; refreshSeconds: number }) {
  const cfg = JSON.stringify({ network: g.networkCode, parent: g.parentAdUnit, child: g.childUnits, lazy: g.lazyLoad, refresh: g.refreshSeconds });
  const lazy = g.lazyLoad ? "{fetchMarginPercent:150,renderMarginPercent:50,mobileScaling:2}" : "false";
  // API nova (setConfig) com reserva para a antiga
  return `(function(){if(location.pathname.indexOf('/admin')===0)return;window.__coAds=${cfg};window.googletag=window.googletag||{cmd:[]};googletag.cmd.push(function(){var p=googletag.pubads();if(typeof googletag.setConfig==='function'){googletag.setConfig({lazyLoad:${lazy},centering:true,targeting:{site:'cacaofertas'}});}else{${
    g.lazyLoad ? "p.enableLazyLoad({fetchMarginPercent:150,renderMarginPercent:50,mobileScaling:2});" : ""
  }p.setCentering(true);p.setTargeting('site','cacaofertas');}googletag.enableServices();});})();`;
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const s = await getSettings();
  const countdown = countdownText(s.countdown);
  const year = new Date().getFullYear();
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700&display=swap"
        />
        <style dangerouslySetInnerHTML={{ __html: cssVars(s) }} />
        <HeadInjections s={s} />
        {s.gam.enabled ? (
          <>
            <script async src="https://securepubads.g.doubleclick.net/tag/js/gpt.js" />
            <script dangerouslySetInnerHTML={{ __html: gptInit(s.gam) }} />
          </>
        ) : null}
      </head>
      <body className={s.gam.enabled ? undefined : "ads-off"}>
        <BodyStartInjections s={s} />
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        {s.announcement ? <div className="announce">{s.announcement}</div> : null}
        <header className="top">
          <div className="wrap top-inner">
            <Link href="/" className="brand" aria-label={`${s.siteName}, página inicial`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.logoUrl} alt={s.siteName} className="brand-logo" width={240} height={58} />
            </Link>
            {countdown ? <p className="countdown">{countdown}</p> : null}
            <nav className="top-nav" aria-label="Principal">
              <Link href="/cupons" className="top-link">
                Cupons
              </Link>
              <Link href="/como-funciona" className="top-link">
                Como funciona
              </Link>
            </nav>
          </div>
        </header>
        <main id="conteudo">{children}</main>
        <footer className="foot">
          <div className="wrap foot-grid">
            <div className="foot-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.logoUrl} alt="" className="foot-logo" width={180} height={44} />
              <p className="foot-tagline">{s.tagline}</p>
            </div>
            <nav className="foot-nav" aria-label="Institucional">
              <Link href="/cupons">Cupons de desconto</Link>
              <Link href="/como-funciona">Como funciona</Link>
              <Link href="/contato">Contato</Link>
              <Link href="/politica-de-privacidade">Política de privacidade</Link>
              <Link href="/termos-de-uso">Termos de uso</Link>
              <Link href="/mapa-do-site">Mapa do site</Link>
            </nav>
            <div className="foot-notes">
              <p>
                Alguns links são de afiliado: se você comprar por eles, a loja nos paga uma comissão e o preço para você
                não muda. Isso não influencia o veredito, que é calculado só pelo histórico.
              </p>
              <p>Preços coletados automaticamente e sujeitos a mudança. Confira o valor final na loja antes de pagar.</p>
              <p>
                © {year} {s.legal.ownerName || s.siteName}
                {s.legal.document ? ` · ${s.legal.document}` : ""}
              </p>
              {s.seals.safeBrowsing || s.seals.html ? (
                <div className="foot-seals" aria-label="Selos de confiança">
                  {s.seals.safeBrowsing ? (
                    <a
                      className="seal"
                      href={`https://transparencyreport.google.com/safe-browsing/search?url=${encodeURIComponent(
                        SITE_URL.replace(/^https?:\/\//, "")
                      )}&hl=pt_BR`}
                      target="_blank"
                      rel="noopener"
                      title="Abre a verificação do Google sobre este site"
                    >
                      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
                        <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Z" fill="#146C2E" />
                        <path d="m8.5 12.2 2.4 2.4 4.8-5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span>
                        <strong>Navegação segura</strong>
                        <small>Ver relatório do Google</small>
                      </span>
                    </a>
                  ) : null}
                  {s.seals.html ? (
                    <div className="seal-custom" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: s.seals.html }} />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </footer>
        <BodyEndInjections s={s} />
      </body>
    </html>
  );
}
