import type { SupabaseClient } from "@supabase/supabase-js";
import type { Collector, OfferInput, Product } from "../types";
import { httpJson, http } from "../http";
import { toAffiliate } from "../affiliate";

/**
 * Mercado Livre — API oficial.
 * Desde 2025 a busca (/sites/MLB/search) exige access token.
 * O token dura 6h e o refresh token é de uso único: a cada renovação
 * o novo refresh token é salvo na tabela `kv` do Supabase.
 *
 * Env: ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REFRESH_TOKEN (só na primeira vez)
 *      ML_AFFILIATE_TEMPLATE (opcional, ex.: link gerado pelo programa de afiliados com {url})
 */

const API = "https://api.mercadolibre.com";
const KV_KEY = "ml_refresh_token";

export function mercadoLivre(db: SupabaseClient): Collector {
  let accessToken: string | null = null;

  async function getToken(): Promise<string> {
    if (accessToken) return accessToken;
    const { data } = await db.from("kv").select("value").eq("key", KV_KEY).maybeSingle();
    const refresh = data?.value || process.env.ML_REFRESH_TOKEN;
    if (!refresh) throw new Error("Sem refresh token do Mercado Livre. Rode `npm run ml:auth`.");

    const res = await http(`${API}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.ML_CLIENT_ID!,
        client_secret: process.env.ML_CLIENT_SECRET!,
        refresh_token: refresh,
      }),
    });
    const json = (await res.json()) as { access_token: string; refresh_token: string };
    accessToken = json.access_token;
    await db.from("kv").upsert({ key: KV_KEY, value: json.refresh_token, updated_at: new Date().toISOString() });
    return accessToken;
  }

  function affiliate(url: string): string | null {
    const tpl = process.env.ML_AFFILIATE_TEMPLATE;
    if (tpl) return tpl.replace("{url}", encodeURIComponent(url)).replace("{raw}", url);
    return toAffiliate(url);
  }

  return {
    source: "mercadolivre",
    enabled: () => Boolean(process.env.ML_CLIENT_ID && process.env.ML_CLIENT_SECRET),
    async collect(product: Product): Promise<OfferInput[]> {
      const token = await getToken();
      const params = new URLSearchParams({ q: product.query, limit: "30", condition: "new" });
      const json = await httpJson<{ results: any[] }>(`${API}/sites/MLB/search?${params}`, {
        headers: { authorization: `Bearer ${token}` },
      });

      return (json.results || [])
        .filter((r) => r.condition === "new")
        .map((r) => ({
          source: "mercadolivre" as const,
          store: "Mercado Livre",
          externalId: String(r.id),
          title: String(r.title),
          url: String(r.permalink),
          affiliateUrl: affiliate(String(r.permalink)),
          imageUrl: r.thumbnail ? String(r.thumbnail).replace(/^http:/, "https:").replace(/-I\.jpg$/, "-O.jpg") : null,
          price: Number(r.price),
          listPrice: r.original_price ? Number(r.original_price) : null,
        }));
    },
  };
}
