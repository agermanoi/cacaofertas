import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

/** Chamado pelo GitHub Actions ao fim da coleta para atualizar o site na hora. */
export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "não autorizado" }, { status: 401 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true, revalidated: new Date().toISOString() });
}
