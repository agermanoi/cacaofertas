import { publicClient } from "./supabase";

/**
 * Configurações do site, editadas em /admin/configuracoes e guardadas na tabela
 * site_settings (linha única, id = 1). Tudo tem valor padrão: o site funciona
 * mesmo com a tabela vazia.
 */
export interface SiteSettings {
  siteName: string;
  tagline: string;
  /** Logo horizontal (cabeçalho). Caminho local (/brand/...) ou URL https do Storage. */
  logoUrl: string;
  /** Ícone quadrado (favicon, atalho no celular, compartilhamento). */
  iconUrl: string;
  colors: {
    primary: string;
    primaryLight: string;
    ink: string;
    background: string;
  };
  heroTitle: string;
  heroText: string;
  /** Faixa opcional no topo do site (ex.: "Black Friday: preços atualizados 2x por dia"). */
  announcement: string;
  contact: {
    email: string;
    whatsapp: string;
    instagram: string;
    /** Endereço da página no Facebook (só o nome de usuário, ex.: cacaofertas.com.br) */
    facebook: string;
    /** Perfil no TikTok (só o usuário, sem @) */
    tiktok: string;
  };
  /** Google Analytics 4 (G-XXXX) e Google Tag Manager (GTM-XXXX). Vazio = desligado. */
  analytics: {
    gaId: string;
    gtmId: string;
  };
  /** HTML livre inserido nas páginas públicas (pixels, verificações, chat etc.). */
  scripts: {
    head: string;
    bodyStart: string;
    bodyEnd: string;
  };
  /** Google Ad Manager: slots gerados a partir dos espaços de anúncio do site. */
  gam: {
    enabled: boolean;
    /** Código da rede (só números), ex.: 21234567890 */
    networkCode: string;
    /** Ad unit pai, ex.: "cacaofertas" ou "cacaofertas/site" */
    parentAdUnit: string;
    /** true = um ad unit filho por posição (pai/home-topo); false = só o pai, com a posição na segmentação */
    childUnits: boolean;
    lazyLoad: boolean;
    /** Segundos entre refreshes de um anúncio visível (0 = sem refresh; mínimo 30) */
    refreshSeconds: number;
  };
  /** Conteúdo do /ads.txt (vendedores autorizados de mídia). */
  adsTxt: string;
  /** Contador do topo ("Faltam 30 dias para a Black Friday"). */
  countdown: {
    enabled: boolean;
    /** Nome do evento, usado em {evento} */
    event: string;
    /** Data do evento (AAAA-MM-DD). Vazio = próxima Black Friday, calculada sozinha. */
    date: string;
    /** Texto antes da data. {dias} vira "30 dias" ou "1 dia"; {evento} vira o nome. */
    before: string;
    /** Texto no dia do evento. */
    today: string;
    /** Texto depois do evento (vazio = esconde o contador). */
    after: string;
  };
  /** Selos de confiança no rodapé. */
  seals: {
    /** Link para o relatório público do Google Navegação Segura sobre o domínio */
    safeBrowsing: boolean;
    /** HTML dos selos de terceiros (Reclame Aqui, Site Blindado...) */
    html: string;
  };
  legal: {
    /** Nome do responsável pelo site (pessoa ou empresa) usado nas páginas legais. */
    ownerName: string;
    /** CNPJ ou CPF (opcional). */
    document: string;
    city: string;
  };
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: process.env.NEXT_PUBLIC_SITE_NAME || "Caça Ofertas",
  tagline: "Encontre a oferta. Confira o histórico. Economize de verdade.",
  logoUrl: "/brand/logo.png",
  iconUrl: "/brand/icone-512.png",
  colors: { primary: "#FF7800", primaryLight: "#F7A535", ink: "#17212F", background: "#F7F8FA" },
  heroTitle: "Antes de comprar, veja quanto custava ontem.",
  heroText:
    "Acompanhamos os produtos mais buscados da Black Friday duas vezes por dia. Quando o desconto é de verdade, você vê no gráfico. Quando é o velho “metade do dobro”, também.",
  announcement: "",
  contact: { email: "", whatsapp: "", instagram: "", facebook: "", tiktok: "" },
  analytics: { gaId: "", gtmId: "" },
  scripts: { head: "", bodyStart: "", bodyEnd: "" },
  gam: { enabled: false, networkCode: "", parentAdUnit: "", childUnits: false, lazyLoad: true, refreshSeconds: 30 },
  adsTxt: "",
  countdown: {
    enabled: true,
    event: "Black Friday",
    date: "",
    before: "Faltam {dias} para a {evento}",
    today: "Hoje é {evento}",
    after: "",
  },
  seals: { safeBrowsing: true, html: "" },
  legal: { ownerName: "", document: "", city: "" },
};

export const SCRIPT_MAX = 20000;
const GA = /^G-[A-Z0-9]{4,20}$/;
const GTM = /^GTM-[A-Z0-9]{4,12}$/;

const HEX = /^#[0-9a-f]{6}$/i;

/** Junta o que veio do banco com os padrões, descartando valores inválidos. */
/** Aceita "@usuario", "usuario" ou a URL do perfil e guarda só o usuário. */
function handle(v: unknown, host: string): string {
  if (typeof v !== "string") return "";
  let t = v.trim();
  const m = t.match(new RegExp(`${host.replace(".", "\\.")}/([^/?#]+)`, "i"));
  if (m) t = m[1];
  return t.replace(/^@/, "").replace(/[^A-Za-z0-9._-]/g, "").slice(0, 60);
}

export function mergeSettings(raw: unknown): SiteSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<SiteSettings>;
  const str = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v.trim() : d);
  const opt = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const color = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toUpperCase() : d);
  const D = DEFAULT_SETTINGS;
  return {
    siteName: str(r.siteName, D.siteName),
    tagline: str(r.tagline, D.tagline),
    logoUrl: str(r.logoUrl, D.logoUrl),
    iconUrl: str(r.iconUrl, D.iconUrl),
    colors: {
      primary: color(r.colors?.primary, D.colors.primary),
      primaryLight: color(r.colors?.primaryLight, D.colors.primaryLight),
      ink: color(r.colors?.ink, D.colors.ink),
      background: color(r.colors?.background, D.colors.background),
    },
    heroTitle: str(r.heroTitle, D.heroTitle),
    heroText: str(r.heroText, D.heroText),
    announcement: opt(r.announcement),
    contact: {
      email: opt(r.contact?.email),
      whatsapp: opt(r.contact?.whatsapp),
      instagram: handle(r.contact?.instagram, "instagram.com"),
      facebook: handle(r.contact?.facebook, "facebook.com"),
      tiktok: handle(r.contact?.tiktok, "tiktok.com"),
    },
    analytics: {
      gaId: GA.test(opt(r.analytics?.gaId).toUpperCase()) ? opt(r.analytics?.gaId).toUpperCase() : "",
      gtmId: GTM.test(opt(r.analytics?.gtmId).toUpperCase()) ? opt(r.analytics?.gtmId).toUpperCase() : "",
    },
    scripts: {
      head: opt(r.scripts?.head).slice(0, SCRIPT_MAX),
      bodyStart: opt(r.scripts?.bodyStart).slice(0, SCRIPT_MAX),
      bodyEnd: opt(r.scripts?.bodyEnd).slice(0, SCRIPT_MAX),
    },
    gam: (() => {
      const g = (r.gam || {}) as Partial<SiteSettings["gam"]>;
      const networkCode = opt(g.networkCode).replace(/\D/g, "").slice(0, 20);
      const parentAdUnit = opt(g.parentAdUnit).replace(/^\/+|\/+$/g, "").replace(/[^A-Za-z0-9_\-./]/g, "").slice(0, 100);
      const rs = Number(g.refreshSeconds ?? D.gam.refreshSeconds);
      return {
        enabled: Boolean(g.enabled) && Boolean(networkCode) && Boolean(parentAdUnit),
        networkCode,
        parentAdUnit,
        childUnits: Boolean(g.childUnits),
        lazyLoad: g.lazyLoad === undefined ? true : Boolean(g.lazyLoad),
        refreshSeconds: !Number.isFinite(rs) || rs <= 0 ? 0 : Math.max(30, Math.min(600, Math.round(rs))),
      };
    })(),
    adsTxt: opt(r.adsTxt).slice(0, 50000),
    countdown: {
      enabled: r.countdown?.enabled === undefined ? D.countdown.enabled : Boolean(r.countdown.enabled),
      event: str(r.countdown?.event, D.countdown.event).slice(0, 60),
      date: /^\d{4}-\d{2}-\d{2}$/.test(opt(r.countdown?.date)) ? opt(r.countdown?.date) : "",
      before: str(r.countdown?.before, D.countdown.before).slice(0, 120),
      today: str(r.countdown?.today, D.countdown.today).slice(0, 120),
      after: opt(r.countdown?.after).slice(0, 120),
    },
    seals: {
      safeBrowsing: r.seals?.safeBrowsing === undefined ? D.seals.safeBrowsing : Boolean(r.seals.safeBrowsing),
      html: opt(r.seals?.html).slice(0, SCRIPT_MAX),
    },
    legal: { ownerName: opt(r.legal?.ownerName), document: opt(r.legal?.document), city: opt(r.legal?.city) },
  };
}

export async function getSettings(): Promise<SiteSettings> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return DEFAULT_SETTINGS;
  try {
    const { data } = await publicClient().from("site_settings").select("data").eq("id", 1).maybeSingle();
    return mergeSettings(data?.data);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Escurece um hex (para hover e texto sobre fundo claro). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}

/** Variáveis CSS geradas a partir das cores configuradas. */
export function cssVars(s: SiteSettings): string {
  const c = s.colors;
  return `:root{--brand:${c.primary};--brand-2:${c.primaryLight};--brand-dark:${shade(c.primary, 0.22)};--ink:${c.ink};--shelf:${c.background};--tag:${c.primary};--tag-ink:${c.ink};--focus:${c.ink};}`;
}

/** Número de WhatsApp só com dígitos, para o link wa.me. */
export function whatsappDigits(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.length >= 10 && d.length <= 11 ? `55${d}` : d;
}

/** Texto do contador do topo (null = não mostrar). Datas no horário de Brasília. */
export function countdownText(c: SiteSettings["countdown"], now = new Date()): string | null {
  if (!c.enabled) return null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now); // AAAA-MM-DD
  let target = c.date;
  if (!target) {
    // Black Friday deste ano (última sexta de novembro); no ano seguinte, o contador volta sozinho
    const d = new Date(Date.UTC(Number(today.slice(0, 4)), 10, 30));
    while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
    target = d.toISOString().slice(0, 10);
  }
  const days = Math.round((Date.parse(target) - Date.parse(today)) / 86_400_000);
  const fill = (t: string) => {
    let out = t.replace(/\{evento\}/g, c.event).replace(/\{dias\}/g, `${days} ${days === 1 ? "dia" : "dias"}`);
    if (days === 1) out = out.replace(/\b(F|f)altam\b/, "$1alta"); // "Falta 1 dia"
    return out.trim();
  };
  if (days > 0) return fill(c.before) || null;
  if (days === 0) return fill(c.today) || null;
  return c.after ? fill(c.after) : null;
}
