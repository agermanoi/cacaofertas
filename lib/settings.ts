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
  contact: { email: "", whatsapp: "", instagram: "" },
  analytics: { gaId: "", gtmId: "" },
  scripts: { head: "", bodyStart: "", bodyEnd: "" },
  legal: { ownerName: "", document: "", city: "" },
};

export const SCRIPT_MAX = 20000;
const GA = /^G-[A-Z0-9]{4,20}$/;
const GTM = /^GTM-[A-Z0-9]{4,12}$/;

const HEX = /^#[0-9a-f]{6}$/i;

/** Junta o que veio do banco com os padrões, descartando valores inválidos. */
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
    contact: { email: opt(r.contact?.email), whatsapp: opt(r.contact?.whatsapp), instagram: opt(r.contact?.instagram) },
    analytics: {
      gaId: GA.test(opt(r.analytics?.gaId).toUpperCase()) ? opt(r.analytics?.gaId).toUpperCase() : "",
      gtmId: GTM.test(opt(r.analytics?.gtmId).toUpperCase()) ? opt(r.analytics?.gtmId).toUpperCase() : "",
    },
    scripts: {
      head: opt(r.scripts?.head).slice(0, SCRIPT_MAX),
      bodyStart: opt(r.scripts?.bodyStart).slice(0, SCRIPT_MAX),
      bodyEnd: opt(r.scripts?.bodyEnd).slice(0, SCRIPT_MAX),
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
