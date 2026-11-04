import { adminClient } from "@/lib/supabase";

/**
 * Chave do IndexNow (Bing, Yandex…): prova que o site é nosso quando avisamos que páginas mudaram.
 * A chave é pública por definição; fica no kv (indexnow_key).
 */
export const revalidate = 3600;

export async function GET() {
  const { data } = await adminClient().from("kv").select("value").eq("key", "indexnow_key").maybeSingle();
  if (!data?.value) return new Response("Não encontrado", { status: 404 });
  return new Response(String(data.value), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
