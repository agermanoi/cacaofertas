"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";
import { ML_STATE_COOKIE, mlAuthorizeUrl, mlConfigured, mlDisconnect } from "@/lib/mercadolivre-auth";

async function requireAdmin() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(ADMIN_COOKIE)?.value))) redirect("/admin/login");
  return jar;
}

/** Gera o "state" anti-falsificação, guarda num cookie e manda para a tela de autorização do ML. */
export async function startMlConnect() {
  const jar = await requireAdmin();
  if (!mlConfigured()) redirect("/admin/mercadolivre?erro=config");
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const state = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  jar.set(ML_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: 600,
  });
  redirect(mlAuthorizeUrl(state));
}

export async function disconnectMl() {
  await requireAdmin();
  await mlDisconnect();
  redirect("/admin/mercadolivre?ok=desconectado");
}
