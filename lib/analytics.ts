/**
 * Métricas próprias do site (sem cookies): visitas e cliques ficam no Supabase.
 * O visitante é um hash do dia + IP + navegador, que muda todo dia: dá para contar
 * pessoas únicas por dia sem guardar IP nem identificar ninguém.
 */

const BOT =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|meta-externalagent|embedly|preview|headless|lighthouse|pagespeed|vercel|monitor|curl|wget|python|axios|node-fetch|go-http|java\/|okhttp|scrapy|httpclient|whatsapp\/|telegrambot|discord|skype|slack/i;

export function isBot(ua: string | null | undefined): boolean {
  return !ua || BOT.test(ua);
}

export function deviceOf(ua: string): "mobile" | "tablet" | "desktop" {
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

const TIKTOK_UA = /musical_ly|BytedanceWebview|TikTok|trill_|ByteLocale/i;

/** De onde veio: utm_source, navegador interno dos apps ou o site que mandou. */
export function sourceOf(opts: { utm?: string | null; ref?: string | null; ua: string; host: string }): { source: string; refHost: string | null } {
  let refHost: string | null = null;
  try {
    refHost = opts.ref ? new URL(opts.ref).hostname.replace(/^www\./, "") : null;
  } catch {
    refHost = null;
  }
  const utm = (opts.utm || "").toLowerCase().trim();
  // o Instagram e o Facebook põem utm_source=ig / fb sozinhos nos links (bio, posts): mesma origem
  const ALIAS: Record<string, string> = { ig: "instagram", fb: "facebook", "facebook.com": "facebook", "instagram.com": "instagram", tt: "tiktok" };
  if (utm) return { source: (ALIAS[utm] || utm).slice(0, 40), refHost };
  if (/instagram/i.test(opts.ua)) return { source: "instagram", refHost };
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(opts.ua)) return { source: "facebook", refHost };
  // navegador interno do TikTok (não manda o site de origem)
  if (TIKTOK_UA.test(opts.ua)) return { source: "tiktok", refHost };
  if (!refHost) return { source: "direto", refHost };
  const self = opts.host.replace(/^www\./, "");
  if (refHost === self || refHost.endsWith(`.${self}`)) return { source: "interno", refHost };
  const map: [RegExp, string][] = [
    [/instagram\.com$/, "instagram"],
    [/(facebook\.com|fb\.com|fb\.me)$/, "facebook"],
    [/(^|\.)google\./, "google"],
    [/(bing\.com|duckduckgo\.com|yahoo\.|ecosia\.org|search\.brave)/, "outras buscas"],
    [/(t\.co|twitter\.com|x\.com)$/, "x"],
    [/(whatsapp\.com|wa\.me)$/, "whatsapp"],
    [/(tiktok\.com)$/, "tiktok"],
    [/(youtube\.com|youtu\.be)$/, "youtube"],
    [/(pinterest\.)/, "pinterest"],
    [/(t\.me|telegram\.)/, "telegram"],
  ];
  for (const [re, name] of map) if (re.test(refHost)) return { source: name, refHost };
  return { source: "outros sites", refHost };
}

export async function visitorHash(ip: string, ua: string): Promise<string> {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const salt = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY?.slice(-24) || "caca";
  const data = new TextEncoder().encode(`${day}|${ip}|${ua}|${salt}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function clientIp(h: Headers): string {
  return (h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0] || "").trim();
}

/** Dados do clique para a tabela clicks (null = robô, não grava). */
export async function clickMeta(h: Headers): Promise<{ visitor: string; source: string } | null> {
  const ua = h.get("user-agent") || "";
  if (isBot(ua)) return null;
  const source = /instagram/i.test(ua) ? "instagram" : /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua) ? "facebook" : TIKTOK_UA.test(ua) ? "tiktok" : "site";
  return { visitor: await visitorHash(clientIp(h), ua), source };
}
