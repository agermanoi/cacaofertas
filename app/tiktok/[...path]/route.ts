import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase";
import { tiktokVerifyFile } from "@/lib/tiktok";

/**
 * Prefixo verificado no app do TikTok (https://SITE/tiktok/):
 *   /tiktok/<arquivo>.txt      arquivo de verificação gravado pelo painel (/admin/tiktok)
 *   /tiktok/m/social/...jpg    arte do Storage servida pelo nosso domínio (o TikTok baixa daqui)
 *   /tiktok/m/social/...mp4    vídeo do Storage, idem
 */
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;

  if (path[0] === "m" && path.length > 1) {
    const rest = path.slice(1).join("/");
    if (!/^social\/[\w\-./]+\.(jpg|mp4)$/.test(rest) || rest.includes("..")) return new NextResponse("Não encontrado", { status: 404 });
    const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const range = _req.headers.get("range");
    const res = await fetch(`${base}/storage/v1/object/public/brand/${rest}`, range ? { headers: { range } } : undefined);
    if (!res.ok || !res.body) return new NextResponse("Não encontrado", { status: 404 });
    const video = rest.endsWith(".mp4");
    const extra: Record<string, string> = {};
    for (const h of ["content-length", "content-range", "accept-ranges"]) {
      const v = res.headers.get(h);
      if (v) extra[h] = v;
    }
    return new NextResponse(res.body, {
      status: res.status,
      headers: {
        ...extra,
        "content-type": video ? "video/mp4" : "image/jpeg",
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
