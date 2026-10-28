import Link from "next/link";
import { adminClient } from "@/lib/supabase";
import { demo } from "@/lib/mock";
import { Flash } from "@/components/admin/Flash";
import type { CouponRow } from "@/components/admin/CouponForm";
import { deleteCoupon, purgeExpired, setCouponActive } from "./actions";

type Props = { searchParams: Promise<{ ok?: string; erro?: string; f?: string }> };

const SOURCE: Record<string, string> = { manual: "Manual", lomadee: "Lomadee", afilio: "Afilio" };

function status(c: CouponRow): { label: string; cls: string } {
  const now = Date.now();
  if (!c.active) return { label: "Pausado", cls: "st-off" };
  if (c.expires_at && new Date(c.expires_at).getTime() < now) return { label: "Vencido", cls: "st-off" };
  if (c.starts_at && new Date(c.starts_at).getTime() > now) return { label: "Agendado", cls: "st-wait" };
  return { label: "No ar", cls: "st-on" };
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—";

export default async function CuponsAdmin({ searchParams }: Props) {
  const { ok, erro, f } = await searchParams;
  let list: CouponRow[] = [];
  let loadError = "";
  if (!demo.enabled()) {
    const { data, error } = await adminClient()
      .from("coupons")
      .select("id,source,store,title,code,discount,description,rules,category,url,affiliate_url,starts_at,expires_at,highlight,active,clicks")
      .order("created_at", { ascending: false })
      .limit(500);
    list = (data as CouponRow[]) || [];
    loadError = error?.message || "";
  }
  const shown = list.filter((c) => {
    const s = status(c).label;
    if (f === "ar") return s === "No ar";
    if (f === "fora") return s !== "No ar";
    return true;
  });
  const live = list.filter((c) => status(c).label === "No ar").length;

  return (
    <div className="wrap admin-page">
      <div className="admin-bar">
        <div>
          <h1>Cupons</h1>
          <p className="admin-sub">
            {list.length} cupons, {live} no ar. Os da Lomadee e da Afilio entram sozinhos a cada coleta.
          </p>
        </div>
        <div className="admin-bar-actions">
          <Link href="/cupons" className="btn btn-ghost" target="_blank">
            Ver página
          </Link>
          <Link href="/admin/cupons/novo" className="btn">
            Novo cupom
          </Link>
        </div>
      </div>
      <Flash ok={ok} erro={erro || (loadError ? `Não foi possível carregar: ${loadError}` : undefined)} />

      <nav className="admin-filter" aria-label="Filtro">
        <Link href="/admin/cupons" aria-current={!f ? "page" : undefined}>
          Todos
        </Link>
        <Link href="/admin/cupons?f=ar" aria-current={f === "ar" ? "page" : undefined}>
          No ar
        </Link>
        <Link href="/admin/cupons?f=fora" aria-current={f === "fora" ? "page" : undefined}>
          Pausados, vencidos e agendados
        </Link>
      </nav>

      {shown.length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Loja</th>
                <th scope="col">Cupom</th>
                <th scope="col">Código</th>
                <th scope="col">Vence</th>
                <th scope="col" className="num">
                  Cliques
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const st = status(c);
                return (
                  <tr key={c.id}>
                    <td>
                      {c.store}
                      <br />
                      <small className="muted">{SOURCE[c.source] || c.source}</small>
                    </td>
                    <td>
                      {c.highlight ? <strong>★ </strong> : null}
                      {c.title}
                      {c.discount ? <small className="muted"> · {c.discount}</small> : null}
                    </td>
                    <td>{c.code ? <code>{c.code}</code> : <small className="muted">sem código</small>}</td>
                    <td>{fmt(c.expires_at)}</td>
                    <td className="num">{c.clicks}</td>
                    <td>
                      <span className={`status ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="row-actions">
                      <Link href={`/admin/cupons/${c.id}`} className="btn btn-small btn-ghost">
                        Editar
                      </Link>
                      <form action={setCouponActive}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={c.active ? "0" : "1"} />
                        <button className="btn btn-small btn-ghost">{c.active ? "Pausar" : "Ativar"}</button>
                      </form>
                      <form action={deleteCoupon}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className="btn btn-small btn-ghost btn-danger">Excluir</button>
                      </form>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">Nenhum cupom aqui ainda. Crie o primeiro em “Novo cupom”.</p>
      )}

      <form action={purgeExpired} className="admin-section">
        <button className="btn btn-ghost btn-small">Apagar cupons vencidos há mais de 7 dias</button>
      </form>
    </div>
  );
}
