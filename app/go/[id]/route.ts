import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase";
import { applyAffiliateTags } from "@/lib/click-tags";

export const dynamic = "force-dynamic";

/** Redireciona para o link de afiliado (ou o da loja). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL("/", req.url));

  const db = adminClient();
  const { data: offer } = await db.from("offers").select("id, url, affiliate_url").eq("id", id).maybeSingle();
  if (!offer) return NextResponse.redirect(new URL("/", req.url));

  // o clique é contado pelo ClickTracker na página (abrir este link direto, como fazem os robôs, não conta)
  const target = await applyAffiliateTags(db, offer.affiliate_url || offer.url);
  const res = NextResponse.redirect(target, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
