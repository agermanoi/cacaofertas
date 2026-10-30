"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { TIKTOK_STATE_COOKIE, tiktokAuthorizeUrl, tiktokDisconnect, tiktokSaveKeys, tiktokSaveVerifyFile } from "@/lib/tiktok";

function back(msg: { ok?: string; erro?: string }): never {
  redirect(`/admin/tiktok?${new URLSearchParams(msg as Record<string, string>)}`);
}

async function requireAdmin() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(ADMIN_COOKIE)?.value))) redirect("/admin/login");
  return jar;
}

export async function saveTiktokKeys(formData: FormData) {
  await requireAdmin();
  const key = String(formData.get("client_key") || "").trim();
  const secret = String(formData.get("client_secret") || "").trim();
  if (!key && !secret) back({ erro: "Preencha o Client key e o Client secret." });
  if (key && !/^[\w-]{6,64}$/.test(key)) back({ erro: "O Client key não parece válido." });
  await tiktokSaveKeys(adminClient(), key, secret);
  revalidatePath("/admin/tiktok");
  back({ ok: "Chaves do app salvas." });
}

export async function saveVerifyFile(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") || "").trim().split("/").pop() || "";
  const content = String(formData.get("content") || "").trim();
  if (!/^[\w\-.]+\.txt$/.test(name)) back({ erro: "O nome do arquivo precisa terminar em .txt (ex.: tiktokAbc123.txt)." });
  if (!content || content.length > 2000) back({ erro: "Cole o conteúdo do arquivo de verificação." });
  await tiktokSaveVerifyFile(adminClient(), name, content);
  revalidatePath("/admin/tiktok");
  back({ ok: `Arquivo publicado em /tiktok/${name}. Agora clique em Verificar no site do TikTok.` });
}

export async function startTiktokConnect() {
  const jar = await requireAdmin();
  const state = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
  const url = await tiktokAuthorizeUrl(adminClient(), state);
  if (!url) back({ erro: "Salve primeiro o Client key e o Client secret do app." });
  jar.set(TIKTOK_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 600,
  });
  redirect(url);
}

export async function disconnectTiktok() {
  await requireAdmin();
  await tiktokDisconnect(adminClient());
  revalidatePath("/admin/tiktok");
  back({ ok: "TikTok desconectado." });
}
