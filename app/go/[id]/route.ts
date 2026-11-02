import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase";
import { clickMeta } from "@/lib/analytics";
import { applyAffiliateTags } from "@/lib/click-tags";

export const dynamic = "force-dynamic";

/** Registra o clique e redireciona para o link de afiliado (ou o da loja). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL("/", req.url));

  const db = adminClient();
  const { data: offer } = await db.from("offers").select("id, product_id, url, affiliate_url").eq("id", id).maybeSingle();
  if (!offer) return NextResponse.redirect(new URL("/", req.url));

  // não bloqueia o redirecionamento se o registro falhar; robôs não contam
  const meta = await clickMeta(req.headers);
  if (meta) {
    await db
      .from("clicks")
      .insert({ offer_id: offer.id, product_id: offer.product_id, referer: req.headers.get("referer")?.slice(0, 300), ...meta })
      .then(
        () => undefined,
        () => undefined
      );
  }

  const target = await applyAffiliateTags(db, offer.affiliate_url || offer.url);
  const res = NextResponse.redirect(target, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
