-- =====================================================================
-- Radar Black Friday — schema Supabase (Postgres)
-- Rode inteiro no SQL Editor do Supabase. É idempotente.
-- =====================================================================

create extension if not exists pgcrypto;

-- Produtos monitorados ------------------------------------------------
create table if not exists products (
  id           uuid primary key default gen_random_uuid(),
  slug         text unique not null,
  name         text not null,
  category     text not null,
  query        text not null,                -- termo usado nas buscas das APIs
  must         text[] not null default '{}', -- palavras que PRECISAM estar no título
  exclude      text[] not null default '{}', -- palavras que descartam a oferta
  min_price    numeric(12,2) not null default 0, -- abaixo disso é acessório/golpe
  max_price    numeric(12,2),
  scrape_urls  text[] not null default '{}', -- URLs de lojas para raspagem direta
  image_url    text,
  popularity   int not null default 0,       -- ordem de "mais buscados"
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Ofertas (um anúncio de uma loja para um produto) --------------------
create table if not exists offers (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products(id) on delete cascade,
  source          text not null,   -- mercadolivre | serpapi | lomadee | scraper
  store           text not null,   -- nome da loja exibido
  external_id     text not null,
  title           text not null,
  url             text not null,
  affiliate_url   text,
  image_url       text,
  last_price      numeric(12,2),
  last_list_price numeric(12,2),
  active          boolean not null default true,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  unique (product_id, source, external_id)
);
-- Ficha técnica editável pelo admin: {"summary": "...", "specs": [["Tela","6,1\""]], "note": "..."}
alter table products add column if not exists specs jsonb;
alter table products add column if not exists updated_at timestamptz not null default now();

create index if not exists offers_product_idx on offers(product_id) where active;

-- Histórico: 1 ponto por oferta por dia ------------------------------
create table if not exists price_history (
  id          bigint generated always as identity primary key,
  offer_id    uuid not null references offers(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  price       numeric(12,2) not null,
  list_price  numeric(12,2),
  captured_on date not null default (now() at time zone 'America/Sao_Paulo')::date,
  captured_at timestamptz not null default now(),
  unique (offer_id, captured_on)
);
create index if not exists price_history_product_day_idx on price_history(product_id, captured_on);

-- Chave/valor (guarda o refresh token do Mercado Livre, que rotaciona) -
create table if not exists kv (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- Cliques nos links de afiliado ---------------------------------------
create table if not exists clicks (
  id         bigint generated always as identity primary key,
  offer_id   uuid references offers(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  referer    text,
  created_at timestamptz not null default now()
);

-- Menor preço do dia por produto --------------------------------------
create or replace view product_daily with (security_invoker = on) as
select product_id, captured_on as day, min(price) as min_price
from price_history
group by product_id, captured_on;

-- Visão geral: melhor preço atual + estatísticas de 30/90 dias ----------
create or replace view product_overview with (security_invoker = on) as
select
  p.id, p.slug, p.name, p.category, p.image_url, p.popularity, p.active,
  cur.best_price, cur.best_list_price, cur.best_offer_id, cur.best_store, cur.offers_count,
  st.min_30d, st.avg_30d, st.max_30d, st.min_90d, st.min_all, st.days_tracked,
  p.specs, p.query, p.must, p.exclude, p.min_price, p.max_price, p.scrape_urls, p.updated_at
from products p
left join lateral (
  select
    min(o.last_price)                                              as best_price,
    (array_agg(o.last_list_price order by o.last_price asc))[1]   as best_list_price,
    (array_agg(o.id order by o.last_price asc))[1]                 as best_offer_id,
    (array_agg(o.store order by o.last_price asc))[1]              as best_store,
    count(*)                                                       as offers_count
  from offers o
  where o.product_id = p.id
    and o.active
    and o.last_price is not null
    and o.last_seen_at > now() - case when o.source = 'amazon' then interval '5 days' else interval '3 days' end
) cur on true
left join lateral (
  select
    min(d.min_price) filter (where d.day >= current_date - 30)                          as min_30d,
    round(avg(d.min_price) filter (where d.day >= current_date - 30 and d.day < current_date), 2) as avg_30d,
    max(d.min_price) filter (where d.day >= current_date - 30)                          as max_30d,
    min(d.min_price) filter (where d.day >= current_date - 90)                          as min_90d,
    min(d.min_price)                                                                    as min_all,
    count(*)                                                                            as days_tracked
  from product_daily d
  where d.product_id = p.id
) st on true;

-- RLS: leitura pública; escrita só com service role --------------------
alter table products      enable row level security;
alter table offers        enable row level security;
alter table price_history enable row level security;
alter table kv            enable row level security;
alter table clicks        enable row level security;

drop policy if exists "public read products" on products;
create policy "public read products" on products for select using (true);
drop policy if exists "public read offers" on offers;
create policy "public read offers" on offers for select using (true);
drop policy if exists "public read history" on price_history;
create policy "public read history" on price_history for select using (true);
-- kv e clicks: sem policy => anon não lê nem escreve (service role ignora RLS)

grant select on product_daily, product_overview to anon, authenticated;

-- ---------- Configurações do site (linha única, editada pelo painel) ----------
create table if not exists site_settings (
  id smallint primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table site_settings enable row level security;
drop policy if exists "public read settings" on site_settings;
create policy "public read settings" on site_settings for select using (true);
insert into site_settings (id) values (1) on conflict (id) do nothing;

-- ---------- Mensagens do formulário de contato (só service role) ----------
create table if not exists contact_messages (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  subject text not null default '',
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table contact_messages enable row level security;
create index if not exists contact_messages_created_idx on contact_messages (created_at desc);

-- ---------- Bucket público para logo e ícone ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('brand', 'brand', true, 2097152, array['image/png','image/jpeg','image/webp','image/svg+xml'])
on conflict (id) do nothing;

-- ---------- Cupons ----------
create table if not exists coupons (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  external_id text,
  store text not null,
  title text not null,
  code text,
  description text,
  rules text,
  discount text,
  category text,
  url text not null,
  affiliate_url text,
  starts_at timestamptz,
  expires_at timestamptz,
  highlight boolean not null default false,
  active boolean not null default true,
  clicks integer not null default 0,
  meta jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coupons_source_external_key unique (source, external_id)
);
create index if not exists coupons_store_idx on coupons (lower(store));
create index if not exists coupons_expires_idx on coupons (expires_at);
alter table coupons enable row level security;
drop policy if exists "public read coupons" on coupons;
create policy "public read coupons" on coupons for select
  using (active and (expires_at is null or expires_at > now()) and (starts_at is null or starts_at <= now()));
create or replace function increment_coupon_click(cid uuid) returns void
language sql security definer set search_path = public as $$
  update coupons set clicks = clicks + 1 where id = cid;
$$;
revoke all on function increment_coupon_click(uuid) from public, anon, authenticated;
grant execute on function increment_coupon_click(uuid) to service_role;

-- ---------- Posts nas redes sociais (Instagram / Facebook) ----------
create table if not exists social_posts (
  id          bigint generated always as identity primary key,
  product_id  uuid references products(id) on delete set null,
  slug        text not null,
  status      text not null default 'queued' check (status in ('queued','publishing','published','failed','discarded')),
  caption     text not null,
  fb_caption  text,
  feed_url    text,
  story_url   text,
  price       numeric,
  reason      text,
  ig_media_id text,
  ig_story_id text,
  fb_post_id  text,
  ig_permalink text,
  error       text,
  created_at  timestamptz not null default now(),
  published_at timestamptz
);
create index if not exists social_posts_product_idx on social_posts(product_id, created_at desc);
create index if not exists social_posts_status_idx on social_posts(status, created_at desc);
alter table social_posts enable row level security;
-- sem policy: só o service role (painel e coleta) lê e escreve

-- ---------- Tentativas de login erradas (bloqueio por IP) ----------
create table if not exists login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_ip_idx on login_attempts(ip, created_at desc);
alter table login_attempts enable row level security;
-- views leem com a permissão de quem consulta (anon só vê o que as policies liberam)
alter view product_overview set (security_invoker = on);
alter view product_daily set (security_invoker = on);

-- Posts de cupom
alter table social_posts add column if not exists kind text not null default 'product' check (kind in ('product','coupon'));
alter table social_posts add column if not exists coupon_id uuid references coupons(id) on delete set null;
create index if not exists social_posts_coupon_idx on social_posts(coupon_id, created_at desc);

-- ---------- Métricas próprias (sem cookies) ----------
create table if not exists page_views (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text not null,
  ref_host text,
  source text not null default 'direto',
  device text not null default 'desktop',
  visitor text            -- hash diário (dia + IP + navegador); não identifica ninguém
);
create index if not exists page_views_created_idx on page_views(created_at desc);
alter table page_views enable row level security;

alter table clicks add column if not exists coupon_id uuid references coupons(id) on delete set null;
alter table clicks add column if not exists visitor text;
alter table clicks add column if not exists source text;
create index if not exists clicks_created_idx on clicks(created_at desc);

-- Resumo do painel /admin/metricas (só service role)
create or replace function site_stats(p_days int) returns jsonb
language sql stable set search_path = public as $$
with b as (select (date_trunc('day', now() at time zone 'America/Sao_Paulo') - make_interval(days => greatest(p_days, 1) - 1)) at time zone 'America/Sao_Paulo' as since),
pv as (select *, (created_at at time zone 'America/Sao_Paulo')::date as day from page_views where created_at >= (select since from b)),
ck as (select *, (created_at at time zone 'America/Sao_Paulo')::date as day from clicks where created_at >= (select since from b)),
days as (select generate_series(((select since from b) at time zone 'America/Sao_Paulo')::date, (now() at time zone 'America/Sao_Paulo')::date, interval '1 day')::date as day)
select jsonb_build_object(
  'views', (select count(*) from pv),
  'visitors', (select count(distinct (day, visitor)) from pv where visitor is not null),
  'offer_clicks', (select count(*) from ck where coupon_id is null),
  'coupon_clicks', (select count(*) from ck where coupon_id is not null),
  'daily', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'views', (select count(*) from pv where pv.day = d.day),
        'visitors', (select count(distinct visitor) from pv where pv.day = d.day),
        'clicks', (select count(*) from ck where ck.day = d.day)) order by d.day), '[]'::jsonb) from days d),
  'pages', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select path, count(*) n from pv group by path order by n desc limit 15) x),
  'sources', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select source, count(*) n, count(distinct (day, visitor)) v from pv group by source order by n desc) x),
  'devices', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select device, count(*) n from pv group by device order by n desc) x),
  'products', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select p.name, p.slug, count(*) n from ck join products p on p.id = ck.product_id
      where ck.coupon_id is null group by p.name, p.slug order by n desc limit 12) x),
  'stores', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select coalesce(o.store, c.store) store, count(*) n from ck
      left join offers o on o.id = ck.offer_id left join coupons c on c.id = ck.coupon_id
      group by 1 order by n desc limit 12) x),
  'coupons', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select c.store, c.code, c.title, count(*) n from ck join coupons c on c.id = ck.coupon_id
      group by c.store, c.code, c.title order by n desc limit 10) x),
  'click_sources', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (select coalesce(source, 'site') source, count(*) n from ck group by 1 order by n desc) x)
);
$$;
revoke all on function site_stats(int) from public, anon, authenticated;

-- ---------- Agendador dos posts (pg_cron + pg_net) ----------
-- Troque o domínio abaixo pelo do site. Roda no minuto 3 de cada hora;
-- os horários de produto e de cupom são escolhidos no painel (Admin → Redes sociais).
create extension if not exists pg_net;
create extension if not exists pg_cron;
insert into kv (key, value) values ('social_cron_secret', encode(extensions.gen_random_bytes(24), 'hex'))
  on conflict (key) do nothing;
select cron.unschedule(jobid) from cron.job where jobname = 'social-tick';
select cron.schedule('social-tick', '3 * * * *', $cron$
  select net.http_post(
    url := 'https://cacaofertas.com.br/api/social/tick',
    headers := jsonb_build_object('authorization', 'Bearer ' || (select value from public.kv where key = 'social_cron_secret'), 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);
