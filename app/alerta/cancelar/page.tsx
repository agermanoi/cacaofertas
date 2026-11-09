import type { Metadata } from "next";
import Link from "next/link";
import { adminClient } from "@/lib/supabase";
import { cancelAlert } from "../actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cancelar aviso de preço", robots: { index: false, follow: false } };

export default async function Cancelar({ searchParams }: { searchParams: Promise<{ t?: string; ok?: string }> }) {
  const { t = "", ok } = await searchParams;
  const db = adminClient();
  const { data: a } = /^[a-f0-9]{36}$/.test(t)
    ? await db.from("price_alerts").select("product_id,canceled_at").eq("token", t).maybeSingle()
    : { data: null };
  const { data: p } = a ? await db.from("products").select("name,slug").eq("id", a.product_id).maybeSingle() : { data: null };

  return (
    <article className="wrap page-text">
      {!a || !p ? (
        <>
          <h1>Link inválido</h1>
          <p>Não encontramos esse aviso.</p>
        </>
      ) : a.canceled_at || ok ? (
        <>
          <h1>Aviso cancelado</h1>
          <p>
            Você não vai mais receber avisos do <strong>{p.name}</strong>. Mudou de ideia? Crie de novo na{" "}
            <Link href={`/produto/${p.slug}`}>página do produto</Link>.
          </p>
        </>
      ) : (
        <>
          <h1>Cancelar aviso de preço</h1>
          <p>
            Parar de receber avisos do <strong>{p.name}</strong>?
          </p>
          {/* botão (e não cancelamento direto no link) para que leitores de e-mail que abrem links sozinhos não cancelem sem querer */}
          <form action={cancelAlert}>
            <input type="hidden" name="t" value={t} />
            <button type="submit" className="btn">
              Cancelar aviso
            </button>
          </form>
        </>
      )}
    </article>
  );
}
