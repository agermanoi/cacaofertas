import { createElement, type ReactNode } from "react";
import * as cheerio from "cheerio";
import type { SiteSettings } from "@/lib/settings";

/**
 * Códigos inseridos pelo painel (Configurações → Scripts e rastreamento).
 *
 * No <head> o React não aceita HTML solto, então o trecho é lido e cada tag
 * permitida (script, noscript, meta, link, style) vira um elemento de verdade.
 * No <body> o HTML entra como está.
 *
 * GA e GTM não contam as visitas do /admin. Os trechos livres carregam em
 * todas as páginas, inclusive no painel.
 */

const HEAD_TAGS = new Set(["script", "noscript", "meta", "link", "style", "base"]);
const ATTR: Record<string, string> = {
  class: "className",
  charset: "charSet",
  crossorigin: "crossOrigin",
  "http-equiv": "httpEquiv",
  referrerpolicy: "referrerPolicy",
  fetchpriority: "fetchPriority",
  nomodule: "noModule",
};
const BOOL = new Set(["async", "defer", "nomodule"]);

function headElements(html: string, prefix: string): ReactNode[] {
  if (!html.trim()) return [];
  const $ = cheerio.load(`<div id="__x">${html}</div>`, null, false);
  const out: ReactNode[] = [];
  $("#__x")
    .children()
    .each((i, el) => {
      if (el.type !== "tag" && el.type !== "script" && el.type !== "style") return;
      const tag = el.name.toLowerCase();
      if (!HEAD_TAGS.has(tag)) return;
      const props: Record<string, unknown> = { key: `${prefix}-${i}` };
      for (const [k, v] of Object.entries(el.attribs || {})) {
        const name = ATTR[k.toLowerCase()] || k;
        props[name] = BOOL.has(k.toLowerCase()) ? true : v;
      }
      const inner = $(el).html() || "";
      if (tag === "script" || tag === "style" || tag === "noscript") {
        if (inner.trim()) props.dangerouslySetInnerHTML = { __html: inner };
      }
      out.push(createElement(tag, props));
    });
  return out;
}

/** Desliga o GA nas telas do painel para não contar suas próprias visitas. */
function adminGuard(gaId: string) {
  return `if(location.pathname.indexOf('/admin')===0){window['ga-disable-${gaId}']=true;window.__noTrack=true;}`;
}

/**
 * Conversão do Google Ads: cada clique em oferta (/go/…) ou cupom (/c/…) conta como "clique para a loja".
 * Usa beacon para não perder o evento quando a página troca para a loja.
 */
function adsClickScript(adsId: string, label: string) {
  return `document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href')||'';if(!/^(https?:\\/\\/[^/]*cacaofertas\\.com\\.br)?\\/(go|c)\\//.test(h))return;if(window.gtag)gtag('event','conversion',{send_to:'${adsId}/${label}',transport_type:'beacon'});},true);`;
}

/**
 * Consent Mode do Google (LGPD): publicidade fica sem cookies até a pessoa aceitar no aviso;
 * medição (Analytics) segue ligada, a menos que ela recuse. A escolha fica em localStorage (co_consent).
 */
const CONSENT_DEFAULT = `(function(){var c=null;try{c=localStorage.getItem('co_consent')}catch(e){}var ads=c==='granted'?'granted':'denied';var an=c==='denied'?'denied':'granted';gtag('consent','default',{ad_storage:ads,ad_user_data:ads,ad_personalization:ads,analytics_storage:an,wait_for_update:500});})();`;

/**
 * Carrega o script do Google só depois que a página terminou de abrir (evento load), para não disputar
 * a internet do celular com o conteúdo. Os eventos chamados antes ficam na fila (dataLayer) e não se perdem.
 */
const LATER = `(function(f){if(document.readyState==='complete')setTimeout(f,0);else addEventListener('load',function(){setTimeout(f,0)},{once:true});})`;

export function HeadInjections({ s }: { s: SiteSettings }) {
  const { gaId, gtmId, adsId, adsClickLabel } = s.analytics;
  const tagId = gaId || adsId;
  const configs = [gaId, adsId].filter(Boolean).map((id) => `gtag('config','${id}');`).join("");
  return (
    <>
      {tagId ? (
        <>
          {gaId ? <script dangerouslySetInnerHTML={{ __html: adminGuard(gaId) }} /> : null}
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}${CONSENT_DEFAULT}if(location.pathname.indexOf('/admin')!==0){gtag('js',new Date());${configs}${LATER}(function(){var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id=${tagId}';document.head.appendChild(s);});}`,
            }}
          />
          {adsId && adsClickLabel ? <script dangerouslySetInnerHTML={{ __html: adsClickScript(adsId, adsClickLabel) }} /> : null}
        </>
      ) : null}
      {gtmId ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `if(location.pathname.indexOf('/admin')!==0){window.dataLayer=window.dataLayer||[];dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});${LATER}(function(){var j=document.createElement('script');j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id=${gtmId}';document.head.appendChild(j);});}`,
          }}
        />
      ) : null}
      {headElements(s.scripts.head, "head")}
    </>
  );
}

export function BodyStartInjections({ s }: { s: SiteSettings }) {
  const { gtmId } = s.analytics;
  return (
    <>
      {gtmId ? (
        <noscript>
          <iframe
            src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
            height="0"
            width="0"
            style={{ display: "none", visibility: "hidden" }}
          />
        </noscript>
      ) : null}
      {s.scripts.bodyStart ? (
        <div className="injected" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: s.scripts.bodyStart }} />
      ) : null}
    </>
  );
}

export function BodyEndInjections({ s }: { s: SiteSettings }) {
  if (!s.scripts.bodyEnd) return null;
  return <div className="injected" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: s.scripts.bodyEnd }} />;
}
