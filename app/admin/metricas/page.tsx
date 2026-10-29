import Link from "next/link";
import { adminClient } from "@/lib/supabase";
import { demo } from "@/lib/mock";
import { getMetaAccount, getSocialStats, type SocialStats } from "@/lib/social";

interface Stats {
  views: number;
  visitors: number;
  offer_clicks: number;
  coupon_clicks: number;
  daily: { day: string; views: number; visitors: number; clicks: number }[];
  pages: { path: string; n: number }[];
  sources: { source: string; n: number; v: number }[];
  devices: { device: string; n: number }[];
  products: { name: string; slug: string; n: number }[];
  stores: { store: string; n: number }[];
  coupons: { store: string; code: string; title: string; n: number }[];
  click_sources: { source: string; n: number }[];
}

const EMPTY: Stats = {
  views: 0,
  visitors: 0,
  offer_clicks: 0,
  coupon_clicks: 0,
  daily: [],
  pages: [],
  sources: [],
  devices: [],
  products: [],
  stores: [],
  coupons: [],
  click_sources: [],
};
const PERIODS = [1, 7, 30, 90];
const int = (n: number | null | undefined) => (n == null ? "—" : Number(n).toLocaleString("pt-BR"));
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "—");
const dayLabel = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
const SOURCE_LABEL: Record<string, string> = {
  direto: "Direto / app",
  interno: "Navegação no site",
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  site: "Site",
};

async function load(days: number): Promise<{ s: Stats; social: SocialStats | null; posts: number; error?: string }> {
  if (demo.enabled()) return { s: EMPTY, social: null, posts: 0 };
  const db = adminClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [stats, acc, posts] = await Promise.all([
    db.rpc("site_stats", { p_days: days }),
    getMetaAccount(db),
    db.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", since),
  ]);
  const social = acc.pageToken ? await getSocialStats(acc) : null;
  return { s: { ...EMPTY, ...((stats.data as Stats) || {}) }, social, posts: posts.count ?? 0, error: stats.error?.message };
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      {hint ? <span className="metric-hint">{hint}</span> : null}
    </div>
  );
}

/** Barras de visitas por dia, com os cliques por cima. */
function DailyChart({ data }: { data: Stats["daily"] }) {
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

function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: (string | React.ReactNode)[][]; empty: string }) {
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

export default async function Metricas({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias } = await searchParams;
  const days = PERIODS.includes(Number(dias)) ? Number(dias) : 7;
  const { s, social, posts, error } = await load(days);
  const clicks = s.offer_clicks + s.coupon_clicks;
  const external = s.sources.filter((x) => x.source !== "interno");

  return (
    <div className="wrap admin-page">
      <div className="admin-bar">
        <div>
          <h1>Métricas</h1>
          <p className="admin-sub">Visitas, cliques para as lojas e redes sociais. Robôs não entram na conta.</p>
        </div>
        <nav className="metric-periods" aria-label="Período">
          {PERIODS.map((p) => (
            <Link key={p} href={`/admin/metricas?dias=${p}`} aria-current={p === days ? "page" : undefined}>
              {p === 1 ? "Hoje" : `${p} dias`}
            </Link>
          ))}
        </nav>
      </div>
      {error ? <p className="flash flash-erro">Não foi possível carregar: {error}</p> : null}

      <div className="metric-cards">
        <Card label="Visitas" value={int(s.views)} hint="páginas vistas" />
        <Card label="Visitantes" value={int(s.visitors)} hint="únicos por dia, somados" />
        <Card label="Cliques para lojas" value={int(clicks)} hint={`${int(s.offer_clicks)} ofertas · ${int(s.coupon_clicks)} cupons`} />
        <Card label="Taxa de clique" value={pct(clicks, s.visitors)} hint="cliques ÷ visitantes" />
        <Card label="Seguidores Instagram" value={int(social?.igFollowers)} hint={social?.igMedia != null ? `${int(social.igMedia)} posts` : undefined} />
        <Card label="Seguidores Facebook" value={int(social?.fbFollowers)} hint={`${int(posts)} posts publicados no período`} />
      </div>

      <section className="admin-section">
        <h2>Por dia</h2>
        <DailyChart data={s.daily} />
      </section>

      <div className="metric-grid">
        <Table
          title="De onde vêm as visitas"
          head={["Origem", "Visitas", "Visitantes"]}
          rows={external.map((x) => [SOURCE_LABEL[x.source] || x.source, int(x.n), int(x.v)])}
          empty="Sem visitas no período."
        />
        <Table
          title="Páginas mais vistas"
          head={["Página", "Visitas"]}
          rows={s.pages.map((x) => [
            <a key={x.path} href={x.path} target="_blank" rel="noopener">
              {x.path}
            </a>,
            int(x.n),
          ])}
          empty="Sem visitas no período."
        />
        <Table
          title="Produtos mais clicados"
          head={["Produto", "Cliques"]}
          rows={s.products.map((x) => [
            <a key={x.slug} href={`/produto/${x.slug}`} target="_blank" rel="noopener">
              {x.name}
            </a>,
            int(x.n),
          ])}
          empty="Nenhum clique em oferta no período."
        />
        <Table
          title="Lojas que mais receberam cliques"
          head={["Loja", "Cliques"]}
          rows={s.stores.map((x) => [x.store || "—", int(x.n)])}
          empty="Nenhum clique no período."
        />
        <Table
          title="Cupons mais clicados"
          head={["Cupom", "Cliques"]}
          rows={s.coupons.map((x) => [`${x.store} · ${x.code || x.title}`, int(x.n)])}
          empty="Nenhum clique em cupom no período."
        />
        <Table
          title="Aparelho e origem dos cliques"
          head={["", "Total"]}
          rows={[
            ...s.devices.map((x) => [x.device === "mobile" ? "Celular" : x.device === "tablet" ? "Tablet" : "Computador", `${int(x.n)} visitas`]),
            ...s.click_sources.map((x) => [`Cliques vindos de: ${SOURCE_LABEL[x.source] || x.source}`, `${int(x.n)} cliques`]),
          ]}
          empty="Sem dados no período."
        />
      </div>

      <Table
        title="Últimos posts no Instagram"
        head={["Post", "Curtidas", "Comentários"]}
        rows={(social?.recent || []).map((m) => [
          <a key={m.id} href={m.permalink} target="_blank" rel="noopener">
            {m.caption || "Post"}
          </a>,
          int(m.likes),
          int(m.comments),
        ])}
        empty={social?.error ? `Não foi possível ler o Instagram: ${social.error}` : "Nenhum post ainda."}
      />

      <section className="admin-section">
        <h2>Vendas e comissões</h2>
        <p className="hint">
          As redes de afiliados não liberam os relatórios de comissão por API para contas novas, então as vendas ficam nos
          painéis delas:{" "}
          <a href="https://associados.amazon.com.br/home/reports" target="_blank" rel="noopener">
            Amazon Associados
          </a>
          {" · "}
          <a href="https://www.lomadee.com/" target="_blank" rel="noopener">
            Lomadee
          </a>
          {" · "}
          <a href="https://www.mercadolivre.com.br/afiliados" target="_blank" rel="noopener">
            Mercado Livre Afiliados
          </a>
          . Compare os cliques daqui com as vendas de lá para ver a conversão de cada loja.
        </p>
      </section>
    </div>
  );
}
