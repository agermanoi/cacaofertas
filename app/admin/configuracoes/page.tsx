import { Flash } from "@/components/admin/Flash";
import { DEFAULT_SETTINGS, countdownText, getSettings } from "@/lib/settings";
import { resetColors, saveSettings } from "./actions";
import { FORMATS, POSITIONS, sizesLabel } from "@/lib/ad-formats";

type Props = { searchParams: Promise<{ ok?: string; erro?: string }> };

const COLORS = [
  { key: "primary", label: "Laranja principal", hint: "Etiquetas de preço, botões e destaques" },
  { key: "primaryLight", label: "Laranja claro", hint: "Botões ao passar o mouse e detalhes" },
  { key: "ink", label: "Grafite", hint: "Textos, títulos e faixa de aviso" },
  { key: "background", label: "Fundo claro", hint: "Fundo do destaque da home e de caixas" },
] as const;

export default async function SettingsPage({ searchParams }: Props) {
  const { ok, erro } = await searchParams;
  const s = await getSettings();

  return (
    <div className="wrap admin-page">
      <div className="admin-bar">
        <div>
          <h1>Configurações do site</h1>
          <p className="admin-sub">Marca, cores, textos da home e dados de contato. As mudanças aparecem no site ao salvar.</p>
        </div>
      </div>
      <Flash ok={ok} erro={erro} />

      <form action={saveSettings} className="admin-form">
        <fieldset>
          <legend>Marca</legend>
          <div className="field">
            <label htmlFor="siteName">Nome do site</label>
            <input id="siteName" name="siteName" defaultValue={s.siteName} required />
          </div>
          <div className="field">
            <label htmlFor="tagline">Slogan</label>
            <input id="tagline" name="tagline" defaultValue={s.tagline} />
            <p className="hint">Aparece no rodapé e na descrição do site no Google.</p>
          </div>

          <div className="brand-row">
            <div className="brand-preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.logoUrl} alt="Logo atual" />
            </div>
            <div className="field">
              <label htmlFor="logo_file">Trocar logo horizontal</label>
              <input id="logo_file" name="logo_file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
              <p className="hint">PNG com fundo transparente, até 2 MB. Ideal: 1200 × 290 px.</p>
              {s.logoUrl !== DEFAULT_SETTINGS.logoUrl ? (
                <label className="check">
                  <input type="checkbox" name="logo_reset" /> Voltar para o logo padrão
                </label>
              ) : null}
            </div>
          </div>

          <div className="brand-row">
            <div className="brand-preview square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.iconUrl} alt="Ícone atual" />
            </div>
            <div className="field">
              <label htmlFor="icon_file">Trocar ícone (favicon)</label>
              <input id="icon_file" name="icon_file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
              <p className="hint">Imagem quadrada, até 2 MB. Ideal: 512 × 512 px. Usada na aba do navegador e no atalho do celular.</p>
              {s.iconUrl !== DEFAULT_SETTINGS.iconUrl ? (
                <label className="check">
                  <input type="checkbox" name="icon_reset" /> Voltar para o ícone padrão
                </label>
              ) : null}
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Cores</legend>
          <div className="color-grid">
            {COLORS.map((c) => (
              <div className="field" key={c.key}>
                <label htmlFor={`color_${c.key}`}>{c.label}</label>
                <div className="color-input">
                  <input
                    id={`color_${c.key}`}
                    name={`color_${c.key}`}
                    type="color"
                    defaultValue={s.colors[c.key]}
                    aria-describedby={`hint_${c.key}`}
                  />
                  <code>{s.colors[c.key]}</code>
                </div>
                <p className="hint" id={`hint_${c.key}`}>
                  {c.hint}
                </p>
              </div>
            ))}
          </div>
          <p className="hint">
            Os textos sobre o laranja usam o grafite, para manter a leitura. Se escolher um laranja muito escuro, confira se os
            preços continuam legíveis.
          </p>
        </fieldset>

        <fieldset>
          <legend>Home</legend>
          <div className="field">
            <label htmlFor="heroTitle">Título principal</label>
            <input id="heroTitle" name="heroTitle" defaultValue={s.heroTitle} />
          </div>
          <div className="field">
            <label htmlFor="heroText">Texto abaixo do título</label>
            <textarea id="heroText" name="heroText" rows={3} defaultValue={s.heroText} />
          </div>
          <div className="field">
            <label htmlFor="announcement">Faixa de aviso no topo (opcional)</label>
            <input
              id="announcement"
              name="announcement"
              defaultValue={s.announcement}
              placeholder="Ex.: Black Friday 2026: preços atualizados duas vezes por dia"
            />
            <p className="hint">Deixe em branco para esconder a faixa.</p>
          </div>
        </fieldset>

        <fieldset id="contador">
          <legend>Contador do topo</legend>
          <label className="check">
            <input type="checkbox" name="cd_enabled" defaultChecked={s.countdown.enabled} /> Mostrar o contador ao lado do logo
          </label>
          <div className="field-row">
            <div className="field">
              <label htmlFor="cd_event">Nome do evento</label>
              <input id="cd_event" name="cd_event" defaultValue={s.countdown.event} placeholder="Black Friday" />
            </div>
            <div className="field">
              <label htmlFor="cd_date">Data do evento</label>
              <input id="cd_date" name="cd_date" type="date" defaultValue={s.countdown.date} />
              <p className="hint">Vazio = próxima Black Friday (última sexta de novembro), calculada sozinha.</p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="cd_before">Texto antes da data</label>
            <input id="cd_before" name="cd_before" defaultValue={s.countdown.before} />
            <p className="hint">
              Use <code>{"{dias}"}</code> para a contagem (“30 dias”, “1 dia”) e <code>{"{evento}"}</code> para o nome do evento.
            </p>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="cd_today">Texto no dia</label>
              <input id="cd_today" name="cd_today" defaultValue={s.countdown.today} />
            </div>
            <div className="field">
              <label htmlFor="cd_after">Texto depois (opcional)</label>
              <input id="cd_after" name="cd_after" defaultValue={s.countdown.after} placeholder="Ex.: Ofertas de Natal no ar" />
              <p className="hint">Vazio = o contador some depois da data.</p>
            </div>
          </div>
          <p className="hint">
            Hoje aparece: <strong>{countdownText(s.countdown) ?? "(oculto)"}</strong>
          </p>
        </fieldset>

        <fieldset>
          <legend>Contato</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="contact_email">E-mail de contato</label>
              <input id="contact_email" name="contact_email" type="email" defaultValue={s.contact.email} placeholder="contato@cacaofertas.com.br" />
            </div>
            <div className="field">
              <label htmlFor="contact_whatsapp">WhatsApp (opcional)</label>
              <input id="contact_whatsapp" name="contact_whatsapp" defaultValue={s.contact.whatsapp} placeholder="(11) 99999-9999" />
            </div>
          </div>
          <div className="field">
            <label htmlFor="contact_instagram">Instagram (opcional)</label>
            <input id="contact_instagram" name="contact_instagram" defaultValue={s.contact.instagram} placeholder="cacaofertas" />
          </div>
          <p className="hint">Aparecem na página de Contato e nas páginas de privacidade e termos.</p>
        </fieldset>

        <fieldset id="scripts">
          <legend>Scripts e rastreamento</legend>
          <div className="field-row">
            <div className="field">
              <label htmlFor="ga_id">Google Analytics 4</label>
              <input id="ga_id" name="ga_id" defaultValue={s.analytics.gaId} placeholder="G-XXXXXXXXXX" autoComplete="off" />
              <p className="hint">Só o ID. O código do Google é inserido automaticamente.</p>
            </div>
            <div className="field">
              <label htmlFor="gtm_id">Google Tag Manager (opcional)</label>
              <input id="gtm_id" name="gtm_id" defaultValue={s.analytics.gtmId} placeholder="GTM-XXXXXXX" autoComplete="off" />
              <p className="hint">Se o GA já estiver configurado dentro do GTM, deixe o campo do GA vazio para não contar em dobro.</p>
            </div>
          </div>
          <div className="field">
            <label htmlFor="scripts_head">Códigos no &lt;head&gt;</label>
            <textarea
              id="scripts_head"
              name="scripts_head"
              rows={6}
              className="code"
              defaultValue={s.scripts.head}
              spellCheck={false}
              placeholder={'<meta name="google-site-verification" content="..." />\n<script async src="https://pagead2.googlesyndication.com/..."></script>'}
            />
            <p className="hint">Para Meta Pixel, AdSense, verificação do Search Console etc. Aceita &lt;script&gt;, &lt;meta&gt;, &lt;link&gt;, &lt;style&gt; e &lt;noscript&gt;.</p>
          </div>
          <div className="field">
            <label htmlFor="scripts_bodyStart">Códigos no início do &lt;body&gt;</label>
            <textarea id="scripts_bodyStart" name="scripts_bodyStart" rows={4} className="code" defaultValue={s.scripts.bodyStart} spellCheck={false} />
          </div>
          <div className="field">
            <label htmlFor="scripts_bodyEnd">Códigos no rodapé (antes do &lt;/body&gt;)</label>
            <textarea id="scripts_bodyEnd" name="scripts_bodyEnd" rows={4} className="code" defaultValue={s.scripts.bodyEnd} spellCheck={false} />
            <p className="hint">Para widgets de chat e scripts que podem carregar por último.</p>
          </div>
          <p className="hint">
            Cole só códigos de fontes confiáveis: eles rodam em todas as páginas. Um código com erro pode quebrar o visual ou
            deixar o site lento. Se algo estranho acontecer, apague o campo e salve.
          </p>
        </fieldset>

        <fieldset id="gam">
          <legend>Anúncios (Google Ad Manager)</legend>
          <label className="check">
            <input type="checkbox" name="gam_enabled" defaultChecked={s.gam.enabled} /> Exibir anúncios do GAM no site
          </label>
          <div className="field-row">
            <div className="field">
              <label htmlFor="gam_network">Código da rede</label>
              <input id="gam_network" name="gam_network" inputMode="numeric" defaultValue={s.gam.networkCode} placeholder="21234567890" autoComplete="off" />
              <p className="hint">Em Admin → Configurações globais da rede, no GAM.</p>
            </div>
            <div className="field">
              <label htmlFor="gam_parent">Ad unit pai</label>
              <input id="gam_parent" name="gam_parent" defaultValue={s.gam.parentAdUnit} placeholder="cacaofertas" autoComplete="off" />
              <p className="hint">O código do ad unit, não o nome. Pode ter níveis: cacaofertas/site.</p>
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="gam_refresh">Refresh (segundos)</label>
              <input id="gam_refresh" name="gam_refresh" type="number" min={0} max={600} step={5} defaultValue={s.gam.refreshSeconds} />
              <p className="hint">Mínimo 30. Use 0 para desligar. Só atualiza anúncio já visto e ainda visível na tela.</p>
            </div>
            <div className="field">
              <span className="label-like">Opções</span>
              <label className="check">
                <input type="checkbox" name="gam_lazy" defaultChecked={s.gam.lazyLoad} /> Lazy load (carrega perto de aparecer na tela)
              </label>
              <label className="check">
                <input type="checkbox" name="gam_child" defaultChecked={s.gam.childUnits} /> Um ad unit filho por posição
              </label>
            </div>
          </div>
          <p className="hint">
            {s.gam.childUnits
              ? "Ad units usados: /rede/pai/posição (crie um filho para cada posição abaixo)."
              : "Todos os espaços usam o ad unit pai. A posição vai na segmentação pos=… (crie a chave “pos” no GAM)."}{" "}
            Toda solicitação leva também as chaves <code>formato</code>, <code>pagina</code> e <code>refresh</code> (0 na primeira exibição).
          </p>

          <details className="gam-details">
            <summary>Posições e tamanhos gerados ({POSITIONS.length})</summary>
            <div className="table-scroll">
              <table className="admin-table gam-table">
                <thead>
                  <tr>
                    <th scope="col">Posição</th>
                    <th scope="col">Ad unit</th>
                    <th scope="col">Desktop</th>
                    <th scope="col">Celular</th>
                  </tr>
                </thead>
                <tbody>
                  {POSITIONS.map((p) => {
                    const f = FORMATS[p.format];
                    const unit = `/${s.gam.networkCode || "REDE"}/${s.gam.parentAdUnit || "PAI"}${s.gam.childUnits ? `/${p.id}` : ""}`;
                    return (
                      <tr key={p.id}>
                        <td>
                          <code>{p.id}</code>
                          <br />
                          <small className="muted">{p.where}</small>
                        </td>
                        <td>
                          <code>{unit}</code>
                          {!s.gam.childUnits ? (
                            <>
                              <br />
                              <small className="muted">pos={p.id}</small>
                            </>
                          ) : null}
                        </td>
                        <td>{sizesLabel(f.desktop)}</td>
                        <td>{sizesLabel(f.mobile)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="hint">Tablet (768 a 1023 px) usa os tamanhos de desktop até 728 px de largura.</p>
          </details>
        </fieldset>

        <fieldset id="selos">
          <legend>Selos de confiança (rodapé)</legend>
          <label className="check">
            <input type="checkbox" name="seal_safebrowsing" defaultChecked={s.seals.safeBrowsing} /> Mostrar o selo “Navegação
            segura”, com link para o relatório público do Google sobre o site
          </label>
          <div className="field">
            <label htmlFor="seals_html">Selos de outros serviços (opcional)</label>
            <textarea
              id="seals_html"
              name="seals_html"
              rows={4}
              className="code"
              defaultValue={s.seals.html}
              spellCheck={false}
              placeholder="Cole aqui o código do selo do Reclame Aqui, Site Blindado etc."
            />
            <p className="hint">
              Use só selos emitidos pelo próprio serviço, que levam a uma página de verificação. Selo sem verificação não
              conta para o visitante e pode ser visto como propaganda enganosa.
            </p>
          </div>
        </fieldset>

        <fieldset id="ads-txt">
          <legend>ads.txt</legend>
          <div className="field">
            <label htmlFor="ads_txt">Conteúdo do arquivo cacaofertas.com.br/ads.txt</label>
            <textarea
              id="ads_txt"
              name="ads_txt"
              rows={8}
              className="code"
              defaultValue={s.adsTxt}
              spellCheck={false}
              placeholder={"google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0"}
            />
            <p className="hint">
              Uma linha por vendedor, do jeito que a rede de anúncios (AdSense, Ad Manager etc.) passar. Depois de salvar, confira
              em <a href="/ads.txt" target="_blank" rel="noopener">/ads.txt</a>.
            </p>
          </div>
        </fieldset>

        <fieldset>
          <legend>Dados do responsável</legend>
          <p className="hint">
            Usados na Política de Privacidade (quem trata os dados) e nos Termos de Uso. A lei pede que o responsável seja
            identificável.
          </p>
          <div className="field-row">
            <div className="field">
              <label htmlFor="legal_ownerName">Nome ou razão social</label>
              <input id="legal_ownerName" name="legal_ownerName" defaultValue={s.legal.ownerName} />
            </div>
            <div className="field">
              <label htmlFor="legal_document">CNPJ ou CPF (opcional)</label>
              <input id="legal_document" name="legal_document" defaultValue={s.legal.document} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="legal_city">Cidade e estado (foro)</label>
            <input id="legal_city" name="legal_city" defaultValue={s.legal.city} placeholder="São Paulo/SP" />
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="btn">
            Salvar configurações
          </button>
        </div>
      </form>

      <form action={resetColors} className="admin-section">
        <button type="submit" className="btn btn-ghost btn-small">
          Restaurar cores da identidade visual
        </button>
      </form>
    </div>
  );
}
