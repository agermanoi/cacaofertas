import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Registra o clique e redireciona para o link de afiliado (ou o da loja). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL("/", req.url));

  const db = adminClient();
  const { data: offer } = await db.from("offers").select("id, product_id, url, affiliate_url").eq("id", id).maybeSingle();
  if (!offer) return NextResponse.redirect(new URL("/", req.url));

  // não bloqueia o redirecionamento se o registro falhar
  await db
    .from("clicks")
    .insert({ offer_id: offer.id, product_id: offer.product_id, referer: req.headers.get("referer")?.slice(0, 300) })
    .then(
      () => undefined,
      () => undefined
    );

  const res = NextResponse.redirect(offer.affiliate_url || offer.url, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
