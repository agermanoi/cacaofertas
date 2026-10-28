# Radar de Ofertas

Histórico de preços da Black Friday. O nome do site vem de `NEXT_PUBLIC_SITE_NAME` (padrão: Radar de Ofertas).

Site público que acompanha os produtos mais buscados da Black Friday em várias lojas,
guarda o histórico diário e diz se o desconto é real ou “metade do dobro”.
Monetização por links de afiliado (Lomadee, Amazon Associados, Mercado Livre, Awin…).

**Stack:** Next.js 15 (Vercel) · Supabase (Postgres) · GitHub Actions (coleta 2×/dia)

```
GitHub Actions ──(2x/dia)──> scripts/collect.ts ──> Supabase (offers + price_history)
                                 │                         │
     Mercado Livre API ──────────┤                         ▼
     SerpAPI (Google Shopping) ──┤                  Next.js na Vercel
     Lomadee (afiliados) ────────┤              (home, /produto/[slug], /go/[id])
     Raspagem (JSON-LD) ─────────┘
```

## Ver o site agora, sem configurar nada

```bash
npm install
DEMO_DATA=1 npm run dev     # http://localhost:3000 com 45 dias de dados fictícios
```

## Colocar no ar (≈ 30 min)

### 1. Supabase
1. Crie um projeto em supabase.com (região São Paulo).
2. SQL Editor → cole e rode `supabase/schema.sql`.
3. Project Settings → API: copie `URL`, `anon key` e `service_role key`.

### 2. Variáveis locais e cadastro dos produtos
```bash
cp .env.example .env     # preencha Supabase + as fontes que for usar
npm run seed             # cadastra os 24 produtos de data/products.json
```

### 3. Fontes de preço (ative as que quiser; cada uma é independente)

| Fonte | O que precisa | Custo |
|---|---|---|
| **Mercado Livre** | App em developers.mercadolivre.com.br → `ML_CLIENT_ID`, `ML_CLIENT_SECRET`, `ML_REDIRECT_URI`. Depois `npm run ml:auth` (abre a URL) e `npm run ml:auth -- TG-codigo`. | Grátis |
| **SerpAPI** | `SERPAPI_KEY` | ~720 buscas/mês com 24 produtos (plano pago) |
| **Lomadee** | `LOMADEE_API_KEY` com escopos `products:read` e `shortener:write`. Links de afiliado são gerados automaticamente. | Grátis |
| **Raspagem** | Coloque URLs de produto em `products.scrape_urls` (Table Editor do Supabase). Lê o JSON-LD das páginas. | Grátis |

Desde 2025 a busca do Mercado Livre exige token; o refresh token é de uso único e a coleta
salva o novo na tabela `kv` a cada execução. Se a coleta ficar mais de 6 meses parada, rode `ml:auth` de novo.

Teste a coleta: `npm run collect` (ou só um produto: `npm run collect -- iphone-16-128gb`).

### 4. Afiliados
- **Amazon:** `AMAZON_ASSOCIATE_TAG=seutag-20`
- **Mercado Livre:** gere o link no programa de afiliados e use `ML_AFFILIATE_TEMPLATE` com `{url}`.
- **Awin / outros deep links:** `AFFILIATE_TEMPLATES={"kabum.com.br":"https://www.awin1.com/cread.php?awinmid=MID&awinaffid=ID&ued={url}"}`
- Todo clique passa por `/go/[id]`, que registra na tabela `clicks` e redireciona.

### 5. Vercel
1. Suba o projeto para um repositório no GitHub e importe na Vercel.
2. Environment Variables: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `REVALIDATE_SECRET`.

### 6. GitHub Actions (coleta automática)
Settings → Secrets and variables → Actions → crie os secrets usados em
`.github/workflows/collect.yml` (Supabase, fontes, afiliados) e também:
- `REVALIDATE_URL` = `https://seudominio.com.br/api/revalidate`
- `REVALIDATE_SECRET` = o mesmo da Vercel

Roda às 09:17 e 21:17 (Brasília). Para rodar na hora: Actions → Coleta de preços → Run workflow.
Na semana da Black Friday, adicione mais horários no `cron` do workflow.

## Painel de produtos (/admin)
Acesse `https://seudominio.com.br/admin` e entre com a senha de `ADMIN_PASSWORD`.

- **Lista:** todos os produtos, com situação, melhor preço e dias de histórico. Busca por nome e filtro por situação.
- **Novo produto / Editar:** nome, categoria, endereço da página, imagem, termo de busca, palavras obrigatórias
  e proibidas, faixa de preço, URLs de raspagem e a ficha técnica (uma especificação por linha, "Rótulo: valor").
- **Pausar:** tira do site e da coleta sem apagar o histórico. **Ativar** devolve.
- **Remover:** apaga produto, ofertas e histórico (pede confirmação).
- **Coletar agora:** dispara o GitHub Actions só para aquele produto. Precisa de `GITHUB_REPO` e `GITHUB_TOKEN`
  (token fine-grained do repositório com permissão *Actions: Read and write*).
- Na edição, a tabela "Anúncios aceitos na última coleta" mostra o que o filtro deixou passar, para calibrar.

Variáveis na Vercel: `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` (texto longo aleatório), `GITHUB_REPO`, `GITHUB_TOKEN`
e `SUPABASE_SERVICE_ROLE_KEY` (o painel grava com ela, só no servidor).
Banco já criado antes do painel? Rode o `supabase/schema.sql` de novo: ele só acrescenta a coluna `specs` e atualiza a view.

## Ajustar produtos pelo arquivo (opcional)
O `data/products.json` agora serve só como lista inicial. `npm run seed` cadastra os que ainda não existem
e não mexe no que você editou pelo painel; `npm run seed -- --atualizar` sobrescreve tudo com o arquivo.
- `query`: termo de busca nas APIs
- `must`: termos obrigatórios no título (`"a|b"` = um ou outro)
- `exclude`: termos que descartam o anúncio (capa, película, usado…)
- `min_price`: abaixo disso é acessório ou golpe
- `popularity`: ordem em “Os mais buscados”

- `"~codigo"` em `must`/`exclude`: código de modelo, casa mesmo grudado em outro texto (`~u8000f` acha "UN55U8000FGXZD")

Para desligar um produto sem apagar: `active = false` no Supabase.

### Ficha técnica
Edite pelo painel. A ficha salva no banco tem prioridade; sem ela, a página usa a de `data/specs.json` pelo slug.
Aparece na página do produto e vai para o JSON-LD (`additionalProperty`). Produto sem ficha só não mostra a seção.

## Como o veredito é calculado (`lib/verdict.ts`)
Precisa de 5 dias de histórico (`NEXT_PUBLIC_MIN_DAYS_FOR_VERDICT`). Compara o menor preço atual
com a média dos 30 dias anteriores:
- **Menor preço já visto:** empata/bate o mínimo histórico
- **Abaixo da média:** ≥ 7% abaixo
- **Acima da média:** ≥ 5% acima
- **Desconto maquiado:** preço “de” > 15% acima do máximo de 30 dias e preço “por” na média
- **Preço de sempre:** o resto

## Estrutura
```
app/                 páginas (home, produto, como-funciona), /go redirect, /api/revalidate, sitemap
components/          etiqueta de preço, gráfico, sparkline, catálogo com busca/filtro
lib/collectors/      mercadolivre, serpapi, lomadee, scraper
lib/match.ts         filtro de anúncios (must/exclude/preço mínimo)
lib/verdict.ts       regra do veredito
lib/mock.ts          dados fictícios (DEMO_DATA=1)
scripts/             collect, seed, ml-auth
supabase/schema.sql  tabelas, views e RLS
```

## Espaços de anúncio
Componente `components/AdSlot.tsx`: só a div, com altura mínima reservada (sem CLS). Ligue o seu ad server pelo id.

| id da div | Página | Posição | Desktop | Mobile |
|---|---|---|---|---|
| `ad-home-topo` | Home | logo após o destaque | 970x90, 728x90 | 320x100, 320x50 |
| `ad-home-lista-1` | Home | após a 6ª linha do catálogo | 728x90, fluid | 300x250, fluid |
| `ad-home-lista-2` | Home | após a 14ª linha | 728x90, fluid | 300x250, fluid |
| `ad-home-rodape` | Home | antes do rodapé | 970x250, 970x90, 728x90 | 300x250, 320x100 |
| `ad-produto-topo` | Produto | entre os números e o gráfico | 970x90, 728x90 | 320x100, 320x50 |
| `ad-produto-rodape` | Produto | depois da tabela de ofertas | 336x280, 300x250 | 300x250 |
| `ad-conteudo-meio` | Como funciona | no meio do texto | 336x280, 300x250 | 300x250 |

Nenhum anúncio fica entre o veredito e o botão "Ver na loja", para não competir com o clique de afiliado.
Cada div traz `data-ad-slot`, `data-sizes-desktop` e `data-sizes-mobile`. Exemplo com GPT:
`googletag.defineSlot('/SEU_ID/radar/home-topo', [[970,90],[728,90]], 'ad-home-topo')`.
`NEXT_PUBLIC_ADS=off` remove todos; `NEXT_PUBLIC_ADS_DEBUG=1` mostra o contorno de cada um.

## Avisos
- Raspagem: respeite os termos de uso e o robots.txt de cada loja; Amazon e algumas grandes varejistas bloqueiam robôs. Prefira API/afiliados.
- O rodapé já informa o uso de links de afiliado (transparência exigida pelo CDC e pelas redes).
