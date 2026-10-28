import Link from "next/link";
import { collectNow, logout, setActive } from "./actions";
import { adminDbReady, adminListProducts } from "@/lib/admin-data";
import { money } from "@/lib/format";
import { Flash } from "@/components/admin/Flash";
import { demo } from "@/lib/mock";

type Props = { searchParams: Promise<{ ok?: string; erro?: string; q?: string; status?: string }> };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default async function AdminHome({ searchParams }: Props) {
  const { ok, erro, q = "", status = "todos" } = await searchParams;

  if (!adminDbReady()) {
    return (
      <div className="wrap admin-page">
        <h1>Produtos</h1>
        <p className="flash flash-erro">
          O painel precisa de <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>SUPABASE_SERVICE_ROLE_KEY</code> configuradas.
        </p>
      </div>
    );
  }

  const all = await adminListProducts();
  const active = all.filter((p) => p.active).length;
  const nq = norm(q.trim());
  const list = all.filter(
    (p) =>
      (status === "todos" || (status === "ativos" ? p.active : !p.active)) &&
      (!nq || norm(`${p.name} ${p.category} ${p.slug}`).includes(nq))
  );

  return (
    <div className="wrap admin-page">
      <div className="admin-bar">
        <div>
          <h1>Produtos</h1>
          <p className="admin-sub">
            {active} no site, {all.length - active} pausados
          </p>
        </div>
        <div className="admin-bar-actions">
          <Link href="/admin/produtos/novo" className="btn">
            Novo produto
          </Link>
          <Link href="/admin/mercadolivre" className="btn btn-ghost">
            Mercado Livre
          </Link>
          <form action={logout}>
            <button type="submit" className="btn btn-ghost">
              Sair
            </button>
          </form>
        </div>
      </div>

      {demo.enabled() ? (
        <p className="flash flash-info">Modo demonstração: dá para navegar, mas nada é salvo.</p>
      ) : null}
      <Flash ok={ok} erro={erro} />

      <form className="admin-filter" method="get">
        <label htmlFor="q" className="sr-only">
          Buscar produto
        </label>
        <input id="q" name="q" type="search" defaultValue={q} placeholder="Buscar por nome ou categoria" />
        <label htmlFor="status" className="sr-only">
          Situação
        </label>
        <select id="status" name="status" defaultValue={status}>
          <option value="todos">Todos</option>
          <option value="ativos">No site</option>
          <option value="pausados">Pausados</option>
        </select>
        <button type="submit" className="btn btn-ghost">
          Filtrar
        </button>
      </form>

      {list.length ? (
        <div className="table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Produto</th>
                <th scope="col">Situação</th>
                <th scope="col" className="num">
                  Melhor preço
                </th>
                <th scope="col" className="num">
                  Histórico
                </th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id} className={p.active ? undefined : "paused"}>
                  <td>
                    <Link href={`/admin/produtos/${p.id}`} className="admin-name">
                      {p.name}
                    </Link>
                    <span className="admin-meta">
                      {p.category} · /produto/{p.slug}
                    </span>
                  </td>
                  <td>
                    <span className={`chip ${p.active ? "chip-on" : "chip-off"}`}>{p.active ? "No site" : "Pausado"}</span>
                  </td>
                  <td className="num">
                    {p.best_price != null ? (
                      <>
                        <strong>{money(p.best_price)}</strong>
                        <span className="admin-meta">
                          {p.offers_count} {Number(p.offers_count) === 1 ? "oferta" : "ofertas"}
                        </span>
                      </>
                    ) : (
                      <span className="admin-meta">Sem oferta</span>
                    )}
                  </td>
                  <td className="num">
                    {p.days_tracked ?? 0} {Number(p.days_tracked) === 1 ? "dia" : "dias"}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link href={`/admin/produtos/${p.id}`} className="btn btn-small">
                        Editar
                      </Link>
                      <form action={setActive}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                        <button type="submit" className="btn btn-small btn-ghost">
                          {p.active ? "Pausar" : "Ativar"}
                        </button>
                      </form>
                      {p.active ? (
                        <form action={collectNow}>
                          <input type="hidden" name="slug" value={p.slug} />
                          <button type="submit" className="btn btn-small btn-ghost">
                            Coletar agora
                          </button>
                        </form>
                      ) : null}
                      {p.active ? (
                        <Link href={`/produto/${p.slug}`} className="btn btn-small btn-ghost" target="_blank">
                          Ver no site
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty">
          {all.length ? (
            <>Nenhum produto encontrado com esse filtro.</>
          ) : (
            <>
              Nenhum produto cadastrado ainda. <Link href="/admin/produtos/novo">Cadastre o primeiro</Link> ou rode{" "}
              <code>npm run seed</code> para importar a lista inicial.
            </>
          )}
        </p>
      )}
    </div>
  );
}
