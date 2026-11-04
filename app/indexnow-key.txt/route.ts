import { adminClient } from "@/lib/supabase";

/**
 * Chave do IndexNow (Bing, Yandex…): prova que o site é nosso quando avisamos que páginas mudaram.
 * A chave é pública por definição; fica no kv (indexnow_key).
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { data } = await adminClient().from("kv").select("value").eq("key", "indexnow_key").maybeSingle();
    if (data?.value) {
      return new Response(String(data.value), {
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, s-maxage=86400" },
      });
    }
  } catch {
    /* sem banco configurado */
  }
  return new Response("Não encontrado", { status: 404 });
}
