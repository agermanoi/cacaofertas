import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Conta o clique no cupom e redireciona para a loja (link de afiliado quando houver). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL("/cupons", req.url));

  const db = adminClient();
  const { data: c } = await db
    .from("coupons")
    .select("id, url, affiliate_url, active, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (!c || !c.active || (c.expires_at && new Date(c.expires_at) < new Date())) {
    return NextResponse.redirect(new URL("/cupons", req.url));
  }

  await db.rpc("increment_coupon_click", { cid: c.id }).then(
    () => undefined,
    () => undefined
  );

  let target = c.affiliate_url || c.url;
  // Código de afiliado da Amazon também nos cupons
  try {
    const u = new URL(target);
    if (/(^|\.)amazon\.com\.br$/.test(u.hostname) && !u.searchParams.get("tag")) {
      let tag = process.env.AMAZON_ASSOCIATE_TAG || "";
      if (!tag) {
        const { data } = await db.from("kv").select("value").eq("key", "amazon_associate_tag").maybeSingle();
        tag = String(data?.value || "");
      }
      if (tag) {
        u.searchParams.set("tag", tag);
        target = u.toString();
      }
    }
  } catch {
    /* URL inválida: segue como está */
  }

  const res = NextResponse.redirect(target, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
