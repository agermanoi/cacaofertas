import type { ReactNode } from "react";

export type DailyPoint = { day: string; views: number; visitors: number; clicks: number };
export type SourceRow = { source: string; n: number; v: number; c?: number };

export const int = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"));
export const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
export const dayLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};

export const SOURCE_LABEL: Record<string, string> = {
  direto: "Direto / app",
  interno: "Navegação no site",
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  tiktok: "TikTok",
  gam: "Anúncios (GAM)",
  googleads: "Google Ads",
  "sem-visita": "Sem visita (robôs e prévias de link)",
  "chatgpt.com": "ChatGPT",
  site: "Site",
};


export function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {hint ? <span className="metric-hint">{hint}</span> : null}
    </div>
  );
}


/** Barras de visitas por dia, com os cliques por cima. */
export function DailyChart({ data }: { data: DailyPoint[] }) {
  if (!data.length) return null;
  const W = 720;
  const H = 200;
  const pad = { l: 36, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.views, d.clicks)));
  const step = (W - pad.l - pad.r) / data.length;
  const bw = Math.max(2, Math.min(28, step * 0.62));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const every = Math.ceil(data.length / 10);
  const ticks = [0, Math.round(max / 2), max];
  return (
    <figure className="metric-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Visitas e cliques por dia">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="grid" />
            <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="axis">
              {t}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad.l + i * step + (step - bw) / 2;
          return (
            <g key={d.day}>
              <rect x={x} y={y(d.views)} width={bw} height={Math.max(0, H - pad.b - y(d.views))} className="bar-views" rx={2}>
                <title>{`${dayLabel(d.day)}: ${d.views} visitas, ${d.visitors} visitantes, ${d.clicks} cliques`}</title>
              </rect>
              <rect
                x={x + bw * 0.25}
                y={y(d.clicks)}
                width={bw * 0.5}
                height={Math.max(0, H - pad.b - y(d.clicks))}
                className="bar-clicks"
                rx={1}
              >
                <title>{`${dayLabel(d.day)}: ${d.clicks} cliques`}</title>
              </rect>
              {i % every === 0 ? (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" className="axis">
                  {dayLabel(d.day)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption>
        <span className="key key-views" /> Visitas <span className="key key-clicks" /> Cliques para lojas
      </figcaption>
    </figure>
  );
}


export function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: (string | ReactNode)[][]; empty: string }) {
  return (
    <section className="admin-section metric-table">
      <h2>{title}</h2>
      {rows.length ? (
        <table>
          <thead>
            <tr>
              {head.map((h, i) => (
                <th key={h} className={i ? "num" : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className={j ? "num" : undefined}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="empty">{empty}</p>
      )}
    </section>
  );
}


/** Tabela de origens: visitas, visitantes, cliques e taxa. */
export function SourcesTable({ rows, title = "De onde vêm as visitas" }: { rows: SourceRow[]; title?: string }) {
  return (
    <Table
      title={title}
      head={["Origem", "Visitas", "Visitantes", "Cliques", "Taxa"]}
      rows={rows.filter((x) => x.source !== "interno").map((x) => [SOURCE_LABEL[x.source] || x.source, int(x.n), int(x.v), int(x.c ?? 0), x.v ? pct(x.c ?? 0, x.v) : "–"])}
      empty="Sem visitas no período."
    />
  );
}
