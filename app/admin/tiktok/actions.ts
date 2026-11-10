"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { checkDispatchToken } from "@/lib/github";
import {
  TIKTOK_STATE_COOKIE,
  tiktokAuthorizeUrl,
  tiktokDirectPostVideo,
  tiktokDisconnect,
  tiktokSaveKeys,
  tiktokSaveVerifyFile,
  tiktokSetDirect,
} from "@/lib/tiktok";

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
  back({ ok: `Arquivo publicado em /${name}. Agora clique em Verify no site do TikTok.` });
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

/** Token do GitHub para disparar o gerador de vídeo logo depois de cada post. */
export async function saveGithubToken(formData: FormData) {
  await requireAdmin();
  const token = String(formData.get("github_token") || "").trim();
  if (!/^(github_pat_|ghp_)[\w]{20,}$/.test(token)) back({ erro: "Cole o token do GitHub (começa com github_pat_)." });
  const err = await checkDispatchToken(token);
  if (err) back({ erro: `Token não funcionou: ${err}.` });
  await adminClient().from("kv").upsert({ key: "github_dispatch_token", value: token, updated_at: new Date().toISOString() });
  revalidatePath("/admin/tiktok");
  back({ ok: "Token salvo: os vídeos agora são gerados logo depois de cada post." });
}

export async function setDirectPost(formData: FormData) {
  await requireAdmin();
  const on = formData.get("on") === "1";
  await tiktokSetDirect(adminClient(), on);
  revalidatePath("/admin/tiktok");
  back({
    ok: on
      ? "Postagem direta ligada. Agora clique em Reconectar para autorizar a permissão video.publish."
      : "Postagem direta desligada: os vídeos voltam a ir só como rascunho.",
  });
}

/** Publica direto no perfil (Direct Post) com as escolhas feitas na tela de publicação. */
export async function publishDirect(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  const go = (msg: Record<string, string>): never => redirect(`/admin/tiktok/publicar/${id}?${new URLSearchParams(msg)}`);
  if (!/^\d+$/.test(id)) redirect("/admin/social");
  const title = String(formData.get("title") || "").trim();
  const privacy = String(formData.get("privacy") || "");
  const brandOrganic = formData.get("brand_organic") === "on";
  const brandContent = formData.get("brand_content") === "on";
  if (!title) go({ erro: "Escreva a legenda." });
  if (!/^(PUBLIC_TO_EVERYONE|MUTUAL_FOLLOW_FRIENDS|FOLLOWER_OF_CREATOR|SELF_ONLY)$/.test(privacy)) go({ erro: "Escolha quem pode ver o vídeo." });
  if (brandContent && privacy === "SELF_ONLY") go({ erro: "Conteúdo de marca não pode ser privado." });

  const db = adminClient();
  const { data: post } = await db.from("social_posts").select("tiktok_video_url").eq("id", id).maybeSingle();
  if (!post?.tiktok_video_url) go({ erro: "Este post não tem vídeo." });
  try {
    const publishId = await tiktokDirectPostVideo(db, {
      videoUrl: post!.tiktok_video_url,
      title,
      privacy,
      allowComment: formData.get("allow_comment") === "on",
      allowDuet: formData.get("allow_duet") === "on",
      allowStitch: formData.get("allow_stitch") === "on",
      brandOrganic,
      brandContent,
    });
    await db.from("social_posts").update({ tiktok_publish_id: publishId, tiktok_error: null }).eq("id", id);
  } catch (e) {
    go({ erro: `O TikTok recusou: ${(e as Error).message}` });
  }
  revalidatePath("/admin/social");
  go({ ok: "Enviado! O TikTok está processando o vídeo; ele aparece no perfil em alguns minutos." });
}
