"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";

async function requireAdmin() {
  const jar = await cookies();
  if (!(await verifySession(jar.get(ADMIN_COOKIE)?.value))) redirect("/admin/login");
}

export async function setRead(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const read = formData.get("read") === "1";
  if (Number.isFinite(id)) await adminClient().from("contact_messages").update({ read }).eq("id", id);
  revalidatePath("/admin/mensagens");
}

export async function deleteMessage(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (Number.isFinite(id)) await adminClient().from("contact_messages").delete().eq("id", id);
  revalidatePath("/admin/mensagens");
}
