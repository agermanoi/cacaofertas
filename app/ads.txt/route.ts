import { getSettings } from "@/lib/settings";

/** /ads.txt editável em Admin → Configurações. */
export const revalidate = 300;

export async function GET() {
  const s = await getSettings();
  const body = s.adsTxt ? `${s.adsTxt.replace(/\r\n/g, "\n").trim()}\n` : "";
  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" },
  });
}
