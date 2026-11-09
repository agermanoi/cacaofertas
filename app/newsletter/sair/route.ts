import { adminClient } from "@/lib/supabase";

/** Descadastro em um clique (List-Unsubscribe-Post). */
export async function POST(req: Request) {
  const t = new URL(req.url).searchParams.get("t") || "";
  if (/^[a-f0-9]{36}$/.test(t))
    await adminClient().from("newsletter_subscribers").update({ canceled_at: new Date().toISOString() }).eq("token", t).is("canceled_at", null);
  return new Response("ok");
}
