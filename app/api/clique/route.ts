import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase";
import { clickMeta } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * Conta os cliques para as lojas, mandados pelo ClickTracker no navegador ao clicar.
 * Corpo: {"o": "<id da oferta>"} ou {"c": "<id do cupom>"}, mais "r": página de onde veio.
 * O /go/ e o /c/ só redirecionam: abrir o link direto (robôs) não conta.
 */
export async function POST(req: NextRequest) {
  let body: { o?: string; c?: string; r?: string } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const id = String(body.o || body.c || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 204 });
  const meta = await clickMeta(req.headers);
  if (!meta) return new NextResponse(null, { status: 204 });
  const db = adminClient();
  const page = String(body.r || req.headers.get("referer") || "").slice(0, 300);
  const referer = page.startsWith("http") ? page : null;
  if (body.c && !body.o) {
    const { data: c } = await db.from("coupons").select("id").eq("id", id).maybeSingle();
    if (c) {
      await Promise.all([
        db.rpc("increment_coupon_click", { cid: c.id }).then(
          () => undefined,
          () => undefined
        ),
        db
          .from("clicks")
          .insert({ coupon_id: c.id, referer, ...meta })
          .then(
            () => undefined,
            () => undefined
          ),
      ]);
    }
    return new NextResponse(null, { status: 204 });
  }
  const { data: offer } = await db.from("offers").select("id, product_id").eq("id", id).maybeSingle();
  if (offer) {
    await db
      .from("clicks")
      .insert({ offer_id: offer.id, product_id: offer.product_id, referer, ...meta })
      .then(
        () => undefined,
        () => undefined
      );
  }
  return new NextResponse(null, { status: 204 });
}
