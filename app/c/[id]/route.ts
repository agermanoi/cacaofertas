import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase";
import { clickMeta } from "@/lib/analytics";
import { applyAffiliateTags } from "@/lib/click-tags";
import { pickLomadeeShort } from "@/lib/collectors/lomadee";

export const dynamic = "force-dynamic";

async function lomadeeShort(db: ReturnType<typeof adminClient>, organizationId: string, url: string): Promise<string | null> {
  let key = process.env.LOMADEE_API_KEY || "";
  if (!key) {
    const { data } = await db.from("kv").select("value").eq("key", "lomadee_api_key").maybeSingle();
    key = String(data?.value || "");
  }
  if (!key) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000); // não deixa o visitante esperando
    const res = await fetch("https://api.lomadee.com.br/affiliate/shortener/url", {
      method: "POST",
      headers: { "x-api-key": key, "content-type": "application/json" },
      body: JSON.stringify({ organizationId, type: "Custom", url }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const r = pickLomadeeShort(await res.json());
    return "url" in r ? r.url : null;
  } catch {
    return null;
  }
}

/** Conta o clique no cupom e redireciona para a loja (link de afiliado quando houver). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(new URL("/cupons", req.url));

  const db = adminClient();
  const { data: c } = await db
    .from("coupons")
    .select("id, source, url, affiliate_url, active, expires_at, meta")
    .eq("id", id)
    .maybeSingle();
  if (!c || !c.active || (c.expires_at && new Date(c.expires_at) < new Date())) {
    return NextResponse.redirect(new URL("/cupons", req.url));
  }

  const meta = await clickMeta(req.headers);
  if (meta) {
    await Promise.all([
      db.rpc("increment_coupon_click", { cid: c.id }).then(
        () => undefined,
        () => undefined
      ),
      db
        .from("clicks")
        .insert({ coupon_id: c.id, referer: req.headers.get("referer")?.slice(0, 300), ...meta })
        .then(
          () => undefined,
          () => undefined
        ),
    ]);
  }

  let target = c.affiliate_url || c.url;

  // Lomadee: gera o link curto de afiliado no primeiro clique e guarda
  const orgId = (c.meta as { organizationId?: string } | null)?.organizationId;
  if (!c.affiliate_url && c.source === "lomadee" && orgId) {
    const aff = await lomadeeShort(db, orgId, c.url);
    if (aff) {
      target = aff;
      await db.from("coupons").update({ affiliate_url: aff }).eq("id", c.id);
    }
  }
  // Códigos de afiliado (Amazon e Mercado Livre) também nos cupons
  target = await applyAffiliateTags(db, target);

  const res = NextResponse.redirect(target, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}
