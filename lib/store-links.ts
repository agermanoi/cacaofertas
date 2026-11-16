import { adminClient } from "./supabase";
import { applyAffiliateTags } from "./click-tags";
import type { OfferRow } from "./types";

/**
 * Para onde vai o botão "Ver na loja" de cada oferta.
 *
 * Mercado Livre: link de afiliado direto no botão. Os termos do programa pedem que o link não seja
 * "encurtado, editado nem modificado" e que o destino fique claro, então ele não passa pelo nosso /go/.
 * O clique é contado à parte, por /api/clique (StoreLink manda um beacon).
 *
 * Demais lojas: /go/<id>, que conta o clique e redireciona. Na Shopee isso evita que o link com o ID de
 * afiliado seja indexado por buscadores (proibido pelos termos dela); o /go/ é bloqueado no robots.txt.
 */
const ML_HOST = /(^|\.)mercadoli(vre|bre)\.com(\.br)?$/;

export interface StoreHref {
  href: string;
  /** id da oferta para contar o clique por beacon (só quando o link é direto) */
  track?: string;
}

export async function storeHrefs(offers: OfferRow[]): Promise<Map<string, StoreHref>> {
  const out = new Map<string, StoreHref>();
  const ml = offers.filter((o) => o.source === "mercadolivre" || isMl(o.affiliate_url || o.url));
  let db: ReturnType<typeof adminClient> | null = null;
  try {
    db = ml.length ? adminClient() : null;
  } catch {
    db = null; // sem a chave do servidor (ex.: build local): fica tudo no /go/
  }
  for (const o of offers) {
    if (db && ml.includes(o)) {
      try {
        out.set(o.id, { href: await applyAffiliateTags(db, o.affiliate_url || o.url), track: o.id });
        continue;
      } catch {
        /* cai no /go/ */
      }
    }
    out.set(o.id, { href: `/go/${o.id}` });
  }
  return out;
}

function isMl(url: string | null): boolean {
  try {
    return url ? ML_HOST.test(new URL(url).hostname) : false;
  } catch {
    return false;
  }
}
