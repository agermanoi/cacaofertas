import Link from "next/link";
import { adminClient } from "@/lib/supabase";
import { Flash } from "@/components/admin/Flash";
import { daysBetween, effectiveDate, todayBR, type EventRow } from "@/lib/events";
import { deleteEvent } from "./actions";

const fmt = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });

export default async function Datas({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams;
  const { data, error } = await adminClient().from("events").select("*").order("date");
  const today = todayBR();
  const list = ((data || []) as EventRow[])
    .map((e) => ({ ...e, next: effectiveDate(e, today) }))
    .sort((a, b) => a.next.localeCompare(b.next));

  return (
    <div className="wrap admin-page">
      <div className="admin-bar">
        <div>
          <h1>Datas do varejo</h1>
          <p className="admin-sub">
            Calendário de promoções: contador do topo, páginas <Link href="/datas">/datas</Link> e posts especiais nas redes.
          </p>
        </div>
        <Link href="/admin/datas/nova" className="btn">
          Nova data
        </Link>
      </div>
      <Flash ok={ok} erro={erro} />
      {error ? (
        <p className="flash flash-erro">
          A tabela de datas ainda não existe no banco: rode o trecho &quot;Datas do varejo&quot; do supabase/schema.sql.
        </p>
      ) : null}

      <table className="metric-table kv-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Dia</th>
            <th>Contador</th>
            <th>Página</th>
            <th>Posts especiais</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {list.map((e) => {
            const d = daysBetween(today, e.next);
            return (
              <tr key={e.id} className={e.active ? undefined : "muted"}>
                <td>
                  <strong>{e.name}</strong>
                  {!e.active ? " (inativa)" : ""}
                </td>
                <td>
                  {fmt(e.next)} <span className="muted">{d === 0 ? "· hoje" : d > 0 ? `· em ${d} dias` : ""}</span>
                </td>
                <td>{e.countdown ? `${e.countdown_days} dias antes` : "não"}</td>
                <td>{e.page ? <Link href={`/datas/${e.slug}`}>/datas/{e.slug}</Link> : "não"}</td>
                <td>{e.extra_posts ? "sim" : "não"}</td>
                <td>
                  <div className="form-actions">
                    <Link href={`/admin/datas/${e.id}`} className="btn btn-ghost btn-small">
                      Editar
                    </Link>
                    <form action={deleteEvent}>
                      <input type="hidden" name="id" value={e.id} />
                      <button className="btn btn-ghost btn-small btn-danger">Excluir</button>
                    </form>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
