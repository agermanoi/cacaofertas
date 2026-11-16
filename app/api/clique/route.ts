import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase";
import { clickMeta } from "@/lib/analytics";

export const dynamic = "force-dynamic";

/**
 * Conta o clique de um botão "Ver na loja" com link direto (Mercado Livre). O navegador manda um beacon
 * ao clicar; o redirecionamento não passa por aqui. Corpo: {"o": "<id da oferta>", "r": "<página>"}.
 */
export async function POST(req: NextRequest) {
  let body: { o?: string; r?: string } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const id = String(body.o || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 204 });
  const meta = await clickMeta(req.headers);
  if (!meta) return new NextResponse(null, { status: 204 });
  const db = adminClient();
  const { data: offer } = await db.from("offers").select("id, product_id").eq("id", id).maybeSingle();
  if (offer) {
    const page = String(body.r || req.headers.get("referer") || "").slice(0, 300);
    await db
      .from("clicks")
      .insert({ offer_id: offer.id, product_id: offer.product_id, referer: page.startsWith("http") ? page : null, ...meta })
      .then(
        () => undefined,
        () => undefined
      );
  }
  return new NextResponse(null, { status: 204 });
}
