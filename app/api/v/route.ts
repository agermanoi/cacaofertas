import { NextResponse, type NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase";
import { clientIp, deviceOf, isBot, sourceOf, visitorHash } from "@/lib/analytics";

/** Registra uma visita (chamado pelo navegador com sendBeacon). Sem cookies. */
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const ua = req.headers.get("user-agent") || "";
  if (isBot(ua)) return new NextResponse(null, { status: 204 });
  let body: { p?: string; r?: string; u?: string } = {};
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  const path = String(body.p || "").split("?")[0].slice(0, 200);
  if (!path.startsWith("/") || path.startsWith("/admin") || path.startsWith("/api")) return new NextResponse(null, { status: 204 });

  const host = req.headers.get("host") || "cacaofertas.com.br";
  const { source, refHost } = sourceOf({ utm: body.u, ref: body.r, ua, host });
  await adminClient()
    .from("page_views")
    .insert({ path, ref_host: refHost?.slice(0, 120) || null, source, device: deviceOf(ua), visitor: await visitorHash(clientIp(req.headers), ua) })
    .then(
      () => undefined,
      () => undefined
    );
  return new NextResponse(null, { status: 204 });
}
