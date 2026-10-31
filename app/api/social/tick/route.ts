import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import { safeEqual } from "@/lib/admin-auth";
import { runTick } from "@/lib/social";

/**
 * Agendador dos posts nas redes. O Supabase (pg_cron) chama de hora em hora;
 * os horários de produto e de cupom são os do painel (Admin → Redes sociais).
 * Autorização: Bearer igual à chave "social_cron_secret" da tabela kv.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const db = adminClient();
  const { data } = await db.from("kv").select("value").eq("key", "social_cron_secret").maybeSingle();
  const secret = String(data?.value || "");
  const auth = req.headers.get("authorization") || "";
  if (secret.length < 24 || !safeEqual(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "não autorizado" }, { status: 401 });
  }
  const f = req.nextUrl.searchParams.get("force");
  const force = f === "coupon" || f === "product" ? f : undefined;
  const result = await runTick(db, { force, deadlineMs: 40_000 });
  // a página do link na bio mostra o que acabou de sair
  if (result.published.length || result.queued.length) revalidatePath("/hoje");
  return NextResponse.json({ ok: true, ...result });
}
