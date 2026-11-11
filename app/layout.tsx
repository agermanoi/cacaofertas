import { siteUrl } from "@/lib/site";
import { CookieConsent, CookiePrefsLink } from "@/components/CookieConsent";
import { NewsletterForm } from "@/components/NewsletterForm";
import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { countdownText, cssVars, getSettings } from "@/lib/settings";
import { countdownEvent, countdownLabel, getPublicEvents, navEvent } from "@/lib/events";
import { BodyEndInjections, BodyStartInjections, HeadInjections } from "@/components/Injected";
import { PageTracker } from "@/components/PageTracker";
import "@fontsource-variable/nunito";
import "@fontsource-variable/nunito-sans";
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
    verification: {
      other: {
        lomadee: process.env.NEXT_PUBLIC_LOMADEE_VERIFICATION || "2324685",
        // Mitgo (Admitad): verificação do site como afiliado
        "mitgo-verification": "77817292-6780-4ad7-b409-214233829503",
      },
    },
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
  const events = await getPublicEvents();
  const ce = s.countdown.enabled && s.countdown.auto ? countdownEvent(events) : null;
  const countdown = ce ? countdownLabel(ce) : countdownText(s.countdown);
  const countdownHref = ce?.e.page ? `/datas/${ce.e.slug}` : null;
  const navEv = navEvent(events);
  const year = new Date().getFullYear();
  // o logo padrão tem 1200 px e 270 KB; na tela ele ocupa 240 px: usamos a versão 480 px em WebP (26 KB)
  const logoSrc = s.logoUrl === "/brand/logo.png" ? "/brand/logo-480.webp" : s.logoUrl;
  return (
    <html lang="pt-BR">
      <head>
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "@id": `${SITE_URL}/#site`,
                  name: s.siteName,
                  alternateName: SITE_URL.replace(/^https?:\/\//, ""),
                  url: SITE_URL,
                  inLanguage: "pt-BR",
                  publisher: { "@id": `${SITE_URL}/#org` },
                },
                {
              "@type": "Organization",
              "@id": `${SITE_URL}/#org`,
              name: s.siteName,
              url: SITE_URL,
              logo: s.logoUrl.startsWith("/") ? `${SITE_URL}${s.logoUrl}` : s.logoUrl,
              sameAs: [
                s.contact.instagram ? `https://www.instagram.com/${s.contact.instagram}/` : null,
                s.contact.facebook ? `https://www.facebook.com/${s.contact.facebook}/` : null,
                s.contact.tiktok ? `https://www.tiktok.com/@${s.contact.tiktok}` : null,
              ].filter(Boolean),
                },
              ],
            }),
          }}
        />
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        {s.announcement ? <div className="announce">{s.announcement}</div> : null}
        <header className="top">
          <div className="wrap top-inner">
            <Link href="/" className="brand" aria-label={`${s.siteName}, página inicial`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt={s.siteName} className="brand-logo" width={240} height={58} fetchPriority="high" />
            </Link>
            {countdown ? (
              countdownHref ? (
                <Link href={countdownHref} className="countdown countdown-link">
                  {countdown}
                </Link>
              ) : (
                <p className="countdown">{countdown}</p>
              )
            ) : null}
            <nav className="top-nav" aria-label="Principal">
              {navEv ? (
                <Link href={`/datas/${navEv.slug}`} className="top-link top-event">
                  {navEv.name}
                </Link>
              ) : null}
              <Link href="/cupons" className="top-link">
                Cupons
              </Link>
              <Link href="/como-funciona" className="top-link top-how">
                Como funciona
              </Link>
            </nav>
          </div>
        </header>
        <main id="conteudo">{children}</main>
        <footer className="foot">
          <div className="wrap foot-newsletter">
            <NewsletterForm source="rodape" compact />
          </div>
          <div className="wrap foot-grid">
            <div className="foot-brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoSrc} alt="" className="foot-logo" width={180} height={44} loading="lazy" />
              <p className="foot-tagline">{s.tagline}</p>
              {s.contact.instagram || s.contact.facebook || s.contact.tiktok ? (
                <div className="foot-social" aria-label="Redes sociais">
                  {s.contact.instagram ? (
                    <a href={`https://www.instagram.com/${s.contact.instagram}/`} target="_blank" rel="noopener" aria-label="Instagram">
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
                        <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
                        <circle cx="17.5" cy="6.5" r="1.3" fill="currentColor" />
                      </svg>
                    </a>
                  ) : null}
                  {s.contact.facebook ? (
                    <a href={`https://www.facebook.com/${s.contact.facebook}/`} target="_blank" rel="noopener" aria-label="Facebook">
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3Z"
                        />
                      </svg>
                    </a>
                  ) : null}
                  {s.contact.tiktok ? (
                    <a href={`https://www.tiktok.com/@${s.contact.tiktok}`} target="_blank" rel="noopener" aria-label="TikTok">
                      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M16.6 3c.3 2.2 1.6 3.7 3.9 3.9v3a7 7 0 0 1-3.8-1.2v6.1A5.8 5.8 0 1 1 10.9 9v3.1a2.8 2.8 0 1 0 2.7 2.8V3h3Z"
                        />
                      </svg>
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
            <nav className="foot-nav" aria-label="Institucional">
              <Link href="/cupons">Cupons de desconto</Link>
              <Link href="/datas">Calendário de promoções</Link>
              <Link href="/precos">Guias de preço</Link>
              <Link href="/como-funciona">Como funciona</Link>
              <Link href="/lojas">Qual loja é mais barata</Link>
              <Link href="/quem-somos">Quem somos</Link>
              <Link href="/contato">Contato</Link>
              <Link href="/politica-de-privacidade">Política de privacidade</Link>
              <Link href="/termos-de-uso">Termos de uso</Link>
              <Link href="/mapa-do-site">Mapa do site</Link>
              <CookiePrefsLink />
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
        <PageTracker />
      <CookieConsent />
      </body>
    </html>
  );
}
