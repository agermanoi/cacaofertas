import { adminClient } from "@/lib/supabase";
import { demo } from "@/lib/mock";
import { Flash } from "@/components/admin/Flash";
import { DEFAULT_SOCIAL, getMetaAccount, getSocialConfig, type MetaAccount, type SocialConfig } from "@/lib/social";
import { createPost, discardPost, publishQueued, retryPost, saveCaption, saveSocial } from "./actions";

// publicar no Instagram espera o processamento da imagem (até ~50 s)
export const maxDuration = 60;

type Post = {
  id: number;
  slug: string;
  status: "queued" | "publishing" | "published" | "failed" | "discarded";
  caption: string;
  fb_caption: string | null;
  feed_url: string | null;
  story_url: string | null;
  price: number | null;
  reason: string | null;
  ig_permalink: string | null;
  ig_media_id: string | null;
  fb_post_id: string | null;
  tiktok_publish_id: string | null;
  error: string | null;
  created_at: string;
  published_at: string | null;
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";
const REASON: Record<string, string> = { record: "Menor preço já visto", below: "Abaixo da média", popular: "Mais buscado", coupon: "Cupom" };
const STATUS: Record<string, string> = {
  queued: "Na fila",
  publishing: "Publicando…",
  published: "Publicado",
  failed: "Falhou",
  discarded: "Descartado",
};

async function load() {
  if (demo.enabled()) {
    return { cfg: DEFAULT_SOCIAL, acc: null as MetaAccount | null, queue: [] as Post[], history: [] as Post[], products: [], lastRun: null };
  }
  const db = adminClient();
  const [cfg, acc, posts, prods, last] = await Promise.all([
    getSocialConfig(db),
    getMetaAccount(db),
    db.from("social_posts").select("*").neq("status", "discarded").order("created_at", { ascending: false }).limit(60),
    db.from("product_overview").select("slug,name,best_price").eq("active", true).not("best_price", "is", null).order("name"),
    db.from("kv").select("value").eq("key", "social_last_run").maybeSingle(),
  ]);
  const list = (posts.data || []) as Post[];
  let lastRun: { at?: string; queued?: string[]; published?: string[]; errors?: string[] } | null = null;
  try {
    lastRun = last.data?.value ? JSON.parse(last.data.value) : null;
  } catch {
    /* ignora */
  }
  return {
    cfg,
    acc,
    queue: list.filter((p) => p.status === "queued" || p.status === "failed" || p.status === "publishing"),
    history: list.filter((p) => p.status === "published"),
    products: (prods.data || []) as { slug: string; name: string; best_price: number }[],
    lastRun,
  };
}

function Connection({ acc }: { acc: MetaAccount | null }) {
  const connected = Boolean(acc?.pageToken);
  return (
    <section className="admin-section social-conn">
      <h2>Conexão</h2>
      {connected ? (
        <ul className="social-accounts">
          <li>
            <strong>Facebook:</strong>{" "}
            <a href={`https://www.facebook.com/${acc!.pageId}`} rel="noopener" target="_blank">
              {acc!.pageName || acc!.pageId}
            </a>
          </li>
          <li>
            <strong>Instagram:</strong>{" "}
            {acc!.igId ? (
              <a href={`https://www.instagram.com/${acc!.igUsername}/`} rel="noopener" target="_blank">
                @{acc!.igUsername}
              </a>
            ) : (
              <span className="muted">não encontrado. Ligue o Instagram profissional à Página e reconecte.</span>
            )}
          </li>
          {acc!.status?.at ? <li className="hint">Conectado em {when(acc!.status.at)}. O token da Página não expira.</li> : null}
          <li>
            <strong>TikTok:</strong> <a href="/admin/tiktok">configurar e conectar</a>
          </li>
        </ul>
      ) : (
        <p className="hint">
          Ainda não conectado{acc?.status?.error ? `: ${acc.status.error}` : "."} Gere um token no Explorador da API do Graph
          e me envie para conectar.
        </p>
      )}
    </section>
  );
}

function Settings({ cfg }: { cfg: SocialConfig }) {
  return (
    <form action={saveSocial} className="admin-form">
      <fieldset>
        <legend>Publicação automática</legend>
        <label className="check">
          <input type="checkbox" name="enabled" defaultChecked={cfg.enabled} />
          <span>Ligado: postar nos horários abaixo</span>
        </label>
        <div className="field-row">
          <div className="field">
            <label htmlFor="mode">Modo</label>
            <select id="mode" name="mode" defaultValue={cfg.mode} className="social-select">
              <option value="approval">Aprovação: entra na fila e eu clico em Publicar</option>
              <option value="auto">Automático: publica sozinho</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="perRun">Produtos por horário</label>
            <input id="perRun" name="perRun" type="number" min={1} max={5} defaultValue={cfg.perRun} />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="productHours">Horários dos produtos</label>
            <input id="productHours" name="productHours" defaultValue={cfg.productHours.join(", ")} placeholder="10, 20" />
            <p className="hint">Horas cheias, horário de Brasília, separadas por vírgula. A coleta de preços roda às 9h e às 21h.</p>
          </div>
          <div className="field">
            <label htmlFor="couponHours">Horários dos cupons (1 cupom por horário)</label>
            <input id="couponHours" name="couponHours" defaultValue={cfg.couponHours.join(", ")} placeholder="12, 15, 18" />
            <p className="hint">O post sai nos primeiros minutos da hora.</p>
          </div>
        </div>
        <div className="social-checks">
          <label className="check">
            <input type="checkbox" name="instagram" defaultChecked={cfg.instagram} />
            <span>Instagram (feed)</span>
          </label>
          <label className="check">
            <input type="checkbox" name="story" defaultChecked={cfg.story} />
            <span>Instagram Stories também</span>
          </label>
          <label className="check">
            <input type="checkbox" name="facebook" defaultChecked={cfg.facebook} />
            <span>Página do Facebook</span>
          </label>
          <label className="check">
            <input type="checkbox" name="tiktok" defaultChecked={cfg.tiktok} />
            <span>
              TikTok (rascunho na caixa de entrada, <a href="/admin/tiktok">conectar</a>)
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset>
        <legend>Quais ofertas</legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="minDrop">Queda mínima vs média de 30 dias (%)</label>
            <input id="minDrop" name="minDrop" type="number" min={1} max={80} defaultValue={cfg.minDrop} />
          </div>
          <div className="field">
            <label htmlFor="repeatDays">Não repetir o mesmo produto por (dias)</label>
            <input id="repeatDays" name="repeatDays" type="number" min={1} max={60} defaultValue={cfg.repeatDays} />
            <p className="hint">Antes disso, só se o preço cair mais 3%.</p>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" name="fallback" defaultChecked={cfg.fallback} />
          <span>Sem queda real no momento, postar os mais buscados com o menor preço do dia</span>
        </label>
        <label className="check">
          <input type="checkbox" name="coupons" defaultChecked={cfg.coupons} />
          <span>Postar cupons (com código, valendo por mais 6 h, sem repetir o cupom em 14 dias nem a loja em 3)</span>
        </label>
        <div className="field">
          <label htmlFor="couponMinPct">Desconto mínimo do cupom (%)</label>
          <input id="couponMinPct" name="couponMinPct" type="number" min={1} max={90} defaultValue={cfg.couponMinPct} />
          <p className="hint">
            Cupom em reais conta a partir de 3× esse valor (10% ⇒ R$ 30 OFF). Cupom marcado como destaque no painel sempre pode entrar.
          </p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Legenda</legend>
        <div className="field">
          <label htmlFor="footer">Linha final</label>
          <input id="footer" name="footer" defaultValue={cfg.footer} maxLength={300} />
        </div>
        <div className="field">
          <label htmlFor="hashtags">Hashtags</label>
          <input id="hashtags" name="hashtags" defaultValue={cfg.hashtags} maxLength={600} />
          <p className="hint">A hashtag da categoria do produto entra sozinha. O Instagram aceita até 30.</p>
        </div>
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="btn">
          Salvar
        </button>
      </div>
    </form>
  );
}

function QueueItem({ p }: { p: Post }) {
  return (
    <li className="social-post">
      {p.feed_url ? (
        <a href={p.feed_url} target="_blank" rel="noopener" className="social-thumb">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.feed_url} alt={`Arte do post de ${p.slug}`} loading="lazy" width={216} height={270} />
        </a>
      ) : null}
      <form action={publishQueued} className="admin-form social-edit">
        <input type="hidden" name="id" value={p.id} />
        <p className="social-meta">
          <span className={`social-status social-${p.status}`}>{STATUS[p.status]}</span> {REASON[p.reason || ""] || ""} ·{" "}
          criado {when(p.created_at)}
          {p.story_url ? (
            <>
              {" · "}
              <a href={p.story_url} target="_blank" rel="noopener">
                ver story
              </a>
            </>
          ) : null}
        </p>
        {p.error ? <p className="flash flash-erro">{p.error}</p> : null}
        <div className="field">
          <label htmlFor={`cap-${p.id}`}>Legenda do Instagram</label>
          <textarea id={`cap-${p.id}`} name="caption" rows={9} defaultValue={p.caption} maxLength={2200} />
        </div>
        <div className="field">
          <label htmlFor={`fb-${p.id}`}>Legenda do Facebook (com link)</label>
          <textarea id={`fb-${p.id}`} name="fb_caption" rows={5} defaultValue={p.fb_caption || ""} maxLength={5000} />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn" disabled={p.status === "publishing"}>
            Publicar agora
          </button>
          <button type="submit" formAction={saveCaption} className="btn btn-ghost">
            Salvar legenda
          </button>
          <button type="submit" formAction={discardPost} className="btn btn-ghost btn-danger">
            Descartar
          </button>
        </div>
      </form>
    </li>
  );
}

export default async function Social({ searchParams }: { searchParams: Promise<{ ok?: string; erro?: string }> }) {
  const { ok, erro } = await searchParams;
  const { cfg, acc, queue, history, products, lastRun } = await load();

  return (
    <div className="wrap admin-page">
      <div className="admin-bar">
        <div>
          <h1>Redes sociais</h1>
          <p className="admin-sub">
            Posts das ofertas no Instagram e no Facebook, com arte gerada a partir do preço de hoje.
            {lastRun?.at ? ` Última execução: ${when(lastRun.at)}.` : ""}
          </p>
        </div>
      </div>
      <Flash ok={ok} erro={erro} />
      {lastRun?.errors?.length ? <p className="flash flash-erro">Última execução: {lastRun.errors.join(" | ")}</p> : null}

      <Connection acc={acc} />

      <section className="admin-section">
        <h2>Criar post agora</h2>
        <form action={createPost} className="admin-form social-create">
          <div className="field">
            <label htmlFor="slug">Produto</label>
            <select id="slug" name="slug" defaultValue="" className="social-select">
              <option value="">Próxima oferta da vez (escolha automática)</option>
              <option value="__cupom">Próximo cupom da vez (escolha automática)</option>
              {products.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name} · {Number(p.best_price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </option>
              ))}
            </select>
          </div>
          <label className="check">
            <input type="checkbox" name="now" />
            <span>Publicar direto, sem passar pela fila</span>
          </label>
          <div className="form-actions">
            <button type="submit" className="btn">
              Gerar post
            </button>
          </div>
        </form>
      </section>

      <section className="admin-section">
        <h2>Fila {queue.length ? `(${queue.length})` : ""}</h2>
        {queue.length ? (
          <ul className="social-list">
            {queue.map((p) => (
              <QueueItem key={p.id} p={p} />
            ))}
          </ul>
        ) : (
          <p className="empty">
            {cfg.mode === "approval"
              ? "Nada esperando aprovação. Depois de cada coleta, as ofertas escolhidas aparecem aqui."
              : "No modo automático os posts saem direto; os que falharem aparecem aqui."}
          </p>
        )}
      </section>

      <section className="admin-section">
        <h2>Configurações</h2>
        <Settings cfg={cfg} />
      </section>

      <section className="admin-section">
        <h2>Publicados</h2>
        {history.length ? (
          <ul className="social-history">
            {history.map((p) => (
              <li key={p.id}>
                {p.feed_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.feed_url} alt="" loading="lazy" width={72} height={90} />
                ) : null}
                <span>
                  <strong>{p.reason === "coupon" ? p.caption.split("\n")[0].replace(/^🎟️\s*/, "") : p.caption.split("\n")[1] || p.slug}</strong>
                  <span className="social-meta">
                    {when(p.published_at)}
                    {p.ig_permalink ? (
                      <>
                        {" · "}
                        <a href={p.ig_permalink} target="_blank" rel="noopener">
                          Instagram
                        </a>
                      </>
                    ) : p.ig_media_id ? (
                      " · Instagram"
                    ) : null}
                    {p.fb_post_id ? (
                      <>
                        {" · "}
                        <a href={`https://www.facebook.com/${p.fb_post_id}`} target="_blank" rel="noopener">
                          Facebook
                        </a>
                      </>
                    ) : null}
                    {p.tiktok_publish_id ? " · TikTok (rascunho enviado)" : null}
                    {p.error ? <span className="muted"> · {p.error}</span> : null}
                    {p.error ? (
                      <form action={retryPost} className="social-retry">
                        <input type="hidden" name="id" value={p.id} />
                        <button className="btn btn-small">Tentar de novo o que faltou</button>
                      </form>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Nenhum post publicado ainda.</p>
        )}
      </section>
    </div>
  );
}
