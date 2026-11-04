import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Dispara o gerador de vídeo do TikTok (GitHub Actions) logo depois de um post.
 * O agendamento do GitHub atrasa e pula horários; o aviso direto não.
 * Token: fine-grained do GitHub só deste repositório, permissão "Actions: Read and write",
 * gravado em Admin → TikTok (kv github_dispatch_token).
 */
const REPO = process.env.GITHUB_REPOSITORY || "agermanoi/cacaofertas";

export async function dispatchVideoJob(db: SupabaseClient): Promise<{ ok: boolean; error?: string }> {
  const { data } = await db.from("kv").select("value").eq("key", "github_dispatch_token").maybeSingle();
  const token = data?.value ? String(data.value) : process.env.GITHUB_DISPATCH_TOKEN || "";
  if (!token) return { ok: false, error: "sem token do GitHub" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/video.yml/dispatches`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
        "user-agent": "cacaofertas",
      },
      body: JSON.stringify({ ref: "main", inputs: { slug: "", send: "true" } }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (res.status === 204) return { ok: true };
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `GitHub ${res.status}${txt ? `: ${txt.slice(0, 120)}` : ""}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Confere se o token funciona (lê o workflow). */
export async function checkDispatchToken(token: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/video.yml`, {
    headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "cacaofertas" },
  }).catch(() => null);
  if (!res) return "não consegui falar com o GitHub";
  if (res.status === 200) return null;
  if (res.status === 401) return "token inválido ou expirado";
  if (res.status === 404) return "o token não tem acesso ao repositório agermanoi/cacaofertas";
  return `GitHub respondeu ${res.status}`;
}
