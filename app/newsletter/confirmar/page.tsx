import type { Metadata } from "next";
import Link from "next/link";
import { adminClient } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirmar inscrição", robots: { index: false, follow: false } };

export default async function Confirmar({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const db = adminClient();
  const { data: s } = /^[a-f0-9]{36}$/.test(t)
    ? await db.from("newsletter_subscribers").select("id,confirmed_at,canceled_at").eq("token", t).maybeSingle()
    : { data: null };
  if (s && !s.confirmed_at && !s.canceled_at) await db.from("newsletter_subscribers").update({ confirmed_at: new Date().toISOString() }).eq("id", s.id);
  return (
    <article className="wrap page-text">
      {!s ? (
        <><h1>Link inválido</h1><p>Não encontramos essa inscrição. Inscreva-se de novo no rodapé do site.</p></>
      ) : s.canceled_at ? (
        <><h1>Inscrição cancelada</h1><p>Essa inscrição foi cancelada antes. Para voltar a receber, inscreva-se de novo no rodapé do site.</p></>
      ) : (
        <>
          <h1>Inscrição confirmada ✅</h1>
          <p>Toda quinta à noite você recebe as <strong>Quedas da semana</strong>: os produtos que realmente baixaram de preço, escolhidos pelo histórico.</p>
          <p><Link className="btn" href="/">Ver as ofertas de hoje</Link></p>
        </>
      )}
    </article>
  );
}
