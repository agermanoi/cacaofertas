import type { Metadata } from "next";
import Link from "next/link";
import { adminClient } from "@/lib/supabase";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Confirmar aviso de preço", robots: { index: false, follow: false } };

export default async function Confirmar({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t = "" } = await searchParams;
  const db = adminClient();
  const { data: a } = /^[a-f0-9]{36}$/.test(t)
    ? await db.from("price_alerts").select("id,product_id,target_price,confirmed_at,canceled_at").eq("token", t).maybeSingle()
    : { data: null };
  if (a && !a.confirmed_at && !a.canceled_at) {
    const now = new Date().toISOString();
    await db.from("price_alerts").update({ confirmed_at: now }).eq("id", a.id);
    // quem marcou "Quedas da semana" junto com o aviso fica confirmado também
    const { data: me } = await db.from("price_alerts").select("email").eq("id", a.id).single();
    if (me) await db.from("newsletter_subscribers").update({ confirmed_at: now }).ilike("email", me.email).eq("source", "aviso").is("confirmed_at", null).is("canceled_at", null);
  }
  const { data: p } = a ? await db.from("products").select("name,slug").eq("id", a.product_id).maybeSingle() : { data: null };

  return (
    <article className="wrap page-text">
      {!a || !p ? (
        <>
          <h1>Link inválido</h1>
          <p>Não encontramos esse aviso. Ele pode ter sido cancelado. Crie um novo na página do produto.</p>
        </>
      ) : a.canceled_at ? (
        <>
          <h1>Aviso cancelado</h1>
          <p>
            Esse aviso foi cancelado antes. Se quiser voltar a receber, crie de novo na página do{" "}
            <Link href={`/produto/${p.slug}`}>{p.name}</Link>.
          </p>
        </>
      ) : (
        <>
          <h1>Aviso ativado ✅</h1>
          <p>
            Vamos te mandar um e-mail quando o <strong>{p.name}</strong>{" "}
            {a.target_price != null ? `chegar a ${money(Number(a.target_price))} ou menos` : "baixar de preço"}.
          </p>
          <p>
            <Link className="btn" href={`/produto/${p.slug}`}>
              Ver o histórico do produto
            </Link>
          </p>
        </>
      )}
    </article>
  );
}
