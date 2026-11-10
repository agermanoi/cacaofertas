import { cookies } from "next/headers";
import { adminClient } from "@/lib/supabase";
import { ADMIN_COOKIE, verifySession } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

/**
 * Exporta os contatos que deram consentimento (CSV para planilha ou CRM).
 * Só e-mails confirmados e não cancelados, com a finalidade de cada um:
 * "aviso" (avisos de preço do produto) e/ou "newsletter" (Quedas da semana).
 */
export async function GET() {
  // o middleware já protege /admin; conferimos de novo por ser dado pessoal
  const jar = await cookies();
  if (!(await verifySession(jar.get(ADMIN_COOKIE)?.value))) return new Response("Não autorizado", { status: 401 });

  const db = adminClient();
  const [{ data: alerts }, { data: subs }] = await Promise.all([
    db
      .from("price_alerts")
      .select("email,target_price,price_at_signup,confirmed_at,created_at,products(name)")
      .not("confirmed_at", "is", null)
      .is("canceled_at", null)
      .limit(10000),
    db.from("newsletter_subscribers").select("email,source,confirmed_at").not("confirmed_at", "is", null).is("canceled_at", null).limit(10000),
  ]);

  type Row = { email: string; newsletter: string; produtos: string[]; alvos: string[]; desde: string };
  const byEmail = new Map<string, Row>();
  const get = (e: string) => {
    const k = e.toLowerCase();
    if (!byEmail.has(k)) byEmail.set(k, { email: k, newsletter: "não", produtos: [], alvos: [], desde: "" });
    return byEmail.get(k)!;
  };
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "");
  const earliest = (r: Row, iso: string | null) => {
    const d = day(iso);
    if (d && (!r.desde || Date.parse(iso!) < Date.parse(r.desde.split("/").reverse().join("-")))) r.desde = d;
  };
  for (const a of alerts || []) {
    const r = get(a.email);
    const name = (a.products as unknown as { name: string } | null)?.name || "";
    r.produtos.push(name);
    r.alvos.push(a.target_price != null ? Number(a.target_price).toFixed(2).replace(".", ",") : "qualquer queda");
    earliest(r, a.confirmed_at);
  }
  for (const s of subs || []) {
    const r = get(s.email);
    r.newsletter = "sim";
    earliest(r, s.confirmed_at);
  }

  const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [
    ["email", "newsletter", "avisos_de_preco", "produtos", "precos_alvo", "consentimento_desde"].join(";"),
    ...[...byEmail.values()]
      .sort((a, b) => a.email.localeCompare(b.email))
      .map((r) => [r.email, r.newsletter, String(r.produtos.length), r.produtos.join(" | "), r.alvos.join(" | "), r.desde].map(esc).join(";")),
  ];
  const stamp = new Date().toISOString().slice(0, 10);
  // BOM para o Excel abrir com acentos certos; ; como separador (padrão do Excel em português)
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cacaofertas-contatos-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
