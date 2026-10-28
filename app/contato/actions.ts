"use server";

import { redirect } from "next/navigation";
import { adminClient } from "@/lib/supabase";
import { demo } from "@/lib/mock";

const text = (f: FormData, k: string, max: number) => String(f.get(k) ?? "").trim().slice(0, max);

function back(q: Record<string, string>): never {
  redirect(`/contato?${new URLSearchParams(q)}#formulario`);
}

export async function sendMessage(formData: FormData) {
  // Campo invisível: pessoas não preenchem, robôs sim. Fingimos sucesso.
  if (text(formData, "hp", 200)) back({ enviado: "1" });

  const name = text(formData, "name", 120);
  const email = text(formData, "email", 200);
  const subject = text(formData, "subject", 80) || "Outro assunto";
  const message = text(formData, "message", 4000);

  if (!name || !email || !message) back({ erro: "Preencha nome, e-mail e mensagem." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back({ erro: "Confira o e-mail: ele não parece válido." });
  if (message.length < 10) back({ erro: "A mensagem ficou curta demais. Conte um pouco mais." });
  if (formData.get("consent") !== "on") back({ erro: "Marque a caixa de concordância com a Política de Privacidade." });

  if (demo.enabled()) back({ enviado: "1" });

  const db = adminClient();
  // Limite simples: no máximo 5 mensagens por e-mail por hora
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db
    .from("contact_messages")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", since);
  if ((count ?? 0) >= 5) back({ erro: "Recebemos várias mensagens suas na última hora. Tente de novo mais tarde." });

  const { error } = await db.from("contact_messages").insert({ name, email, subject, message });
  if (error) back({ erro: "Não foi possível enviar agora. Tente de novo em alguns minutos." });
  back({ enviado: "1" });
}
