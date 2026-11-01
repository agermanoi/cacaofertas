import type { EventRow } from "@/lib/events";
import { saveEvent } from "@/app/admin/datas/actions";

/** Formulário de data do varejo (nova ou edição). */
export function EventForm({ e }: { e?: Partial<EventRow> & { date_raw?: string } }) {
  return (
    <form action={saveEvent} className="admin-form">
      {e?.id ? <input type="hidden" name="id" value={e.id} /> : null}
      <fieldset>
        <legend>Data</legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="name">Nome</label>
            <input id="name" name="name" required maxLength={40} defaultValue={e?.name} placeholder="11.11" />
          </div>
          <div className="field">
            <label htmlFor="article">Artigo</label>
            <select id="article" name="article" defaultValue={e?.article || "o"} className="social-select">
              <option value="o">o (o 11.11, o Dia do Consumidor)</option>
              <option value="a">a (a Black Friday)</option>
              <option value="os">os</option>
              <option value="as">as</option>
            </select>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="date">Dia</label>
            <input id="date" name="date" type="date" required defaultValue={e?.date_raw || e?.date} />
          </div>
          <div className="field">
            <label htmlFor="slug">Endereço da página</label>
            <input id="slug" name="slug" defaultValue={e?.slug} placeholder="11-11 (vira /datas/11-11)" />
          </div>
        </div>
        <label className="check">
          <input type="checkbox" name="yearly" defaultChecked={e?.yearly ?? true} />
          <span>Repete todo ano no mesmo dia (11/11, 12/12…). Desmarque para datas que mudam, como Black Friday e Dia das Mães.</span>
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={e?.active ?? true} />
          <span>Ativa</span>
        </label>
      </fieldset>

      <fieldset>
        <legend>No site</legend>
        <label className="check">
          <input type="checkbox" name="countdown" defaultChecked={e?.countdown ?? true} />
          <span>Aparece no contador do topo</span>
        </label>
        <div className="field">
          <label htmlFor="countdown_days">A partir de quantos dias antes</label>
          <input id="countdown_days" name="countdown_days" type="number" min={0} max={120} defaultValue={e?.countdown_days ?? 15} />
          <p className="hint">Também é quando o link da data aparece no menu.</p>
        </div>
        <label className="check">
          <input type="checkbox" name="page" defaultChecked={e?.page ?? true} />
          <span>Tem página própria (preço para bater, descontos reais no dia, cupons da data, perguntas frequentes)</span>
        </label>
        <div className="field">
          <label htmlFor="intro">Texto de abertura da página</label>
          <textarea id="intro" name="intro" rows={4} maxLength={1200} defaultValue={e?.intro} />
        </div>
        <div className="field">
          <label htmlFor="terms">Palavras que marcam os cupons da data</label>
          <input id="terms" name="terms" defaultValue={(e?.terms || []).join(", ")} placeholder="11.11, 11/11, dia dos solteiros" />
          <p className="hint">Separadas por vírgula. Cupons com essas palavras vão para o topo da página e têm prioridade nos posts do dia.</p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Redes sociais</legend>
        <label className="check">
          <input type="checkbox" name="extra_posts" defaultChecked={e?.extra_posts ?? false} />
          <span>
            Posts especiais: aviso na véspera (19h), mais horários no dia com o selo da data e resumo no dia seguinte (11h)
          </span>
        </label>
      </fieldset>

      <div className="form-actions">
        <button className="btn">Salvar</button>
      </div>
    </form>
  );
}
