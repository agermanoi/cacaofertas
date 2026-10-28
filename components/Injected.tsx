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

export function HeadInjections({ s }: { s: SiteSettings }) {
  const { gaId, gtmId } = s.analytics;
  return (
    <>
      {gaId ? (
        <>
          <script dangerouslySetInnerHTML={{ __html: adminGuard(gaId) }} />
          <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`,
            }}
          />
        </>
      ) : null}
      {gtmId ? (
        <script
          dangerouslySetInnerHTML={{
            __html: `if(location.pathname.indexOf('/admin')!==0){(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${gtmId}');}`,
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
