import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase";
import { tiktokVerifyFile } from "@/lib/tiktok";

/**
 * Prefixo verificado no app do TikTok (https://SITE/tiktok/):
 *   /tiktok/<arquivo>.txt      arquivo de verificação gravado pelo painel (/admin/tiktok)
 *   /tiktok/m/social/...jpg    arte do Storage servida pelo nosso domínio (o TikTok baixa daqui)
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;

  if (path[0] === "m" && path.length > 1) {
    const rest = path.slice(1).join("/");
    if (!/^social\/[\w\-./]+\.jpg$/.test(rest) || rest.includes("..")) return new NextResponse("Não encontrado", { status: 404 });
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const res = await fetch(`${base}/storage/v1/object/public/brand/${rest}`);
    if (!res.ok || !res.body) return new NextResponse("Não encontrado", { status: 404 });
    return new NextResponse(res.body, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=31536000, immutable",
        "x-robots-tag": "noindex",
      },
    });
  }

  if (path.length === 1 && /^[\w\-.]+\.txt$/.test(path[0])) {
    const content = await tiktokVerifyFile(adminClient(), path[0]);
    if (content != null) return new NextResponse(content, { headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse("Não encontrado", { status: 404 });
}
