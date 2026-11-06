import Link from "next/link";
import { adminClient } from "@/lib/supabase";
import { demo } from "@/lib/mock";
import { Card, DailyChart, SourcesTable, Table, int, pct, type DailyPoint, type SourceRow } from "@/components/admin/Metrics";

interface ProductStats {
  views: number;
  visitors: number;
  clicks: number;
  daily: DailyPoint[];
  sources: SourceRow[];
  stores: { store: string; n: number }[];
  pages: { path: string; n: number }[];
  devices: { device: string; n: number }[];
}

export const PRODUCT_PERIODS = [1, 7, 30, 90];

const pageLabel = (path: string, own: string) =>
  path === own
    ? "Página do produto"
    : path === "/"
      ? "Página inicial"
      : path.startsWith("/precos/")
        ? `Guia ${path.slice(8)}`
        : path.startsWith("/categoria/")
          ? `Categoria ${path.slice(11)}`
          : path;

/** Visitas da página do produto e cliques para as lojas, com a origem de cada visitante. */
export async function ProductMetrics({ id, slug, days }: { id: string; slug: string; days: number }) {
  if (demo.enabled()) return null;
  const { data, error } = await adminClient().rpc("product_stats", { p_product: id, p_days: days });
  const s = (data as ProductStats | null) ?? null;
  const own = `/produto/${slug}`;
  const mobile = s?.devices.find((d) => d.device === "mobile")?.n ?? 0;

  return (
    <section className="admin-section" aria-labelledby="metricas-produto">
      <div className="admin-bar">
        <h2 id="metricas-produto">Métricas do produto</h2>
        <nav className="metric-periods" aria-label="Período">
          {PRODUCT_PERIODS.map((p) => (
            <Link key={p} href={`/admin/produtos/${id}?dias=${p}#metricas-produto`} aria-current={p === days ? "page" : undefined} scroll={false}>
              {p === 1 ? "Hoje" : `${p} dias`}
            </Link>
          ))}
        </nav>
      </div>
      {error || !s ? (
        <p className="flash flash-erro">Não foi possível carregar as métricas{error ? `: ${error.message}` : "."}</p>
      ) : (
        <>
          <div className="metric-cards">
            <Card label="Visitas na página" value={int(s.views)} hint={s.views ? `${pct(mobile, s.views)} no celular` : undefined} />
            <Card label="Visitantes" value={int(s.visitors)} hint="únicos por dia, somados" />
            <Card label="Cliques para lojas" value={int(s.clicks)} hint="de qualquer página do site" />
            <Card label="Taxa de clique" value={pct(s.clicks, s.visitors)} hint="cliques ÷ visitantes" />
          </div>
          {s.views || s.clicks ? <DailyChart data={s.daily} /> : null}
          <div className="metric-grid">
            <SourcesTable rows={s.sources} title="De onde vêm os visitantes" />
            <Table
              title="Onde clicaram"
              head={["Página", "Cliques"]}
              rows={s.pages.map((x) => [pageLabel(x.path, own), int(x.n)])}
              empty="Sem cliques no período."
            />
            <Table title="Cliques por loja" head={["Loja", "Cliques"]} rows={s.stores.map((x) => [x.store, int(x.n)])} empty="Sem cliques no período." />
          </div>
          <p className="hint">
            A origem é a primeira visita de fora do site do mesmo visitante nas 24 horas anteriores (ChatGPT, Google, Instagram…).
            Robôs não entram na conta.
          </p>
        </>
      )}
    </section>
  );
}
