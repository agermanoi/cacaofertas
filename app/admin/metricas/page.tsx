import Link from "next/link";
import { adminClient } from "@/lib/supabase";
import { demo } from "@/lib/mock";
import { Card, DailyChart, SOURCE_LABEL, Table, int, pct, type DailyPoint, type SourceRow } from "@/components/admin/Metrics";
import { getMetaAccount, getSocialStats, type SocialStats } from "@/lib/social";

interface Stats {
  views: number;
  visitors: number;
  offer_clicks: number;
  coupon_clicks: number;
  daily: DailyPoint[];
  pages: { path: string; n: number }[];
  sources: SourceRow[];
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

async function load(
  days: number
): Promise<{ s: Stats; geo: { country: string; city: string; n: number; v: number }[]; social: SocialStats | null; posts: number; error?: string }> {
  if (demo.enabled()) return { s: EMPTY, geo: [], social: null, posts: 0 };
  const db = adminClient();
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const [stats, acc, posts, geo] = await Promise.all([
    db.rpc("site_stats", { p_days: days }),
    getMetaAccount(db),
    db.from("social_posts").select("id", { count: "exact", head: true }).eq("status", "published").gte("published_at", since),
    db.rpc("site_geo", { p_days: days }),
  ]);
  const social = acc.pageToken ? await getSocialStats(acc) : null;
  return {
    s: { ...EMPTY, ...((stats.data as Stats) || {}) },
    geo: ((geo.data as { country: string; city: string; n: number; v: number }[]) || []),
    social,
    posts: posts.count ?? 0,
    error: stats.error?.message,
  };
}




export default async function Metricas({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  const { dias } = await searchParams;
  const days = PERIODS.includes(Number(dias)) ? Number(dias) : 7;
  const { s, geo, social, posts, error } = await load(days);
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
          head={["Origem", "Visitas", "Visitantes", "Cliques", "Taxa"]}
          rows={external.map((x) => [SOURCE_LABEL[x.source] || x.source, int(x.n), int(x.v), int(x.c ?? 0), x.v ? pct(x.c ?? 0, x.v) : "–"])}
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
          title="De onde (país e cidade)"
          head={["Local", "Visitas", "Visitantes"]}
          rows={geo.map((g) => [`${g.city !== "?" ? `${g.city}, ` : ""}${g.country === "?" ? "desconhecido" : g.country}`, int(g.n), int(g.v)])}
          empty="Sem visitas com localização no período (a contagem por local começou agora)."
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
