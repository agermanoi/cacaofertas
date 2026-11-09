import type { Metadata } from "next";
import { adminClient } from "@/lib/supabase";
import { cancelNewsletter } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cancelar inscrição", robots: { index: false, follow: false } };

export default async function Cancelar({ searchParams }: { searchParams: Promise<{ t?: string; ok?: string }> }) {
  const { t = "", ok } = await searchParams;
  const { data: s } = /^[a-f0-9]{36}$/.test(t)
    ? await adminClient().from("newsletter_subscribers").select("canceled_at").eq("token", t).maybeSingle()
    : { data: null };
  return (
    <article className="wrap page-text">
      {!s ? (
        <><h1>Link inválido</h1><p>Não encontramos essa inscrição.</p></>
      ) : s.canceled_at || ok ? (
        <><h1>Inscrição cancelada</h1><p>Você não vai mais receber as Quedas da semana. Avisos de preço de produtos específicos, se tiver, continuam até você cancelar cada um.</p></>
      ) : (
        <>
          <h1>Cancelar as Quedas da semana</h1>
          <p>Parar de receber o e-mail semanal do Caça Ofertas?</p>
          <form action={cancelNewsletter}>
            <input type="hidden" name="t" value={t} />
            <button type="submit" className="btn">Cancelar inscrição</button>
          </form>
        </>
      )}
    </article>
  );
}
