import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Códigos de afiliado aplicados na hora do clique (/go e /c), em qualquer oferta,
 * inclusive nas antigas: assim, trocar o código no painel vale na hora.
 *   Amazon:        ?tag=  (kv amazon_associate_tag ou AMAZON_ASSOCIATE_TAG)
 *   Mercado Livre: parâmetros do programa de afiliados (kv ml_affiliate_params,
 *                  ex.: "matt_word=fulano&matt_tool=12345678"), gravados em /admin/mercadolivre
 */

const ML_HOST = /(^|\.)mercadoli(vre|bre)\.com(\.br)?$/;
/** parâmetros de rastreio do Mercado Livre que valem a pena guardar */
export const ML_TRACKING_KEYS = ["matt_word", "matt_tool", "matt_source", "matt_campaign_id", "tracking_id"];

export async function applyAffiliateTags(db: SupabaseClient, target: string): Promise<string> {
  let u: URL;
  try {
    u = new URL(target);
  } catch {
    return target;
  }
  const isAmazon = /(^|\.)amazon\.com\.br$/.test(u.hostname);
  const isMl = ML_HOST.test(u.hostname) && !/\/(sec|social)\//.test(u.pathname);
  if (!isAmazon && !isMl) return target;
  const { data } = await db.from("kv").select("key,value").in("key", ["amazon_associate_tag", "ml_affiliate_params"]);
  const kv = Object.fromEntries((data || []).map((r) => [r.key, String(r.value || "")]));

  if (isAmazon && !u.searchParams.get("tag")) {
    const tag = process.env.AMAZON_ASSOCIATE_TAG || kv.amazon_associate_tag || "";
    if (tag) u.searchParams.set("tag", tag);
  }
  if (isMl && !u.searchParams.get("matt_tool") && kv.ml_affiliate_params) {
    const extra = new URLSearchParams(kv.ml_affiliate_params);
    for (const [k, v] of extra) if (!u.searchParams.has(k)) u.searchParams.set(k, v);
  }
  return u.toString();
}

/**
 * Extrai os parâmetros de afiliado de um link do Mercado Livre colado no painel.
 * Aceita o link longo (com matt_word/matt_tool) ou o curto (mercadolivre.com/sec/…),
 * que é seguido até o link final.
 */
export async function mlParamsFromLink(input: string): Promise<{ params: string; finalUrl: string } | { error: string }> {
  let url = input.trim();
  if (!/^https?:\/\//.test(url)) {
    // só os parâmetros: "matt_word=x&matt_tool=y"
    const p = new URLSearchParams(url.replace(/^\?/, ""));
    const keep = new URLSearchParams();
    for (const k of ML_TRACKING_KEYS) if (p.get(k)) keep.set(k, p.get(k)!);
    return keep.toString() ? { params: keep.toString(), finalUrl: "" } : { error: "Não encontrei matt_word/matt_tool no texto colado." };
  }
  for (let i = 0; i < 6; i++) {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { error: "Link inválido." };
    }
    const keep = new URLSearchParams();
    for (const k of ML_TRACKING_KEYS) if (u.searchParams.get(k)) keep.set(k, u.searchParams.get(k)!);
    if (keep.get("matt_tool") || keep.get("matt_word")) return { params: keep.toString(), finalUrl: url };
    // link curto: segue o redirecionamento
    try {
      const res = await fetch(url, { redirect: "manual", headers: { "user-agent": "Mozilla/5.0" } });
      const loc = res.headers.get("location");
      if (!loc) break;
      url = new URL(loc, url).toString();
    } catch {
      break;
    }
  }
  return {
    error:
      "Não achei os parâmetros de afiliado nesse link. Abra o link gerado no portal numa aba anônima, espere carregar e copie o endereço completo da barra (ele tem matt_word e matt_tool).",
  };
}
