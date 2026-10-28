import Link from "next/link";
import { saveCoupon } from "@/app/admin/cupons/actions";

export type CouponRow = {
  id: string;
  source: string;
  store: string;
  title: string;
  code: string | null;
  discount: string | null;
  description: string | null;
  rules: string | null;
  category: string | null;
  url: string;
  affiliate_url: string | null;
  starts_at: string | null;
  expires_at: string | null;
  highlight: boolean;
  active: boolean;
  clicks: number;
};

/** ISO → valor do input datetime-local no horário de Brasília. */
function local(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

export function CouponForm({ c, stores }: { c?: CouponRow; stores: string[] }) {
  const imported = c && c.source !== "manual";
  return (
    <form action={saveCoupon} className="admin-form">
      {c ? <input type="hidden" name="id" value={c.id} /> : null}
      {imported ? (
        <p className="flash flash-info">
          Cupom importado da {c!.source === "lomadee" ? "Lomadee" : "Afilio"}. Alterações podem ser sobrescritas na próxima
          importação; para esconder, use “Pausar”.
        </p>
      ) : null}

      <fieldset>
        <legend>Cupom</legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="store">Loja</label>
            <input id="store" name="store" required defaultValue={c?.store} list="stores" placeholder="Amazon" />
            <datalist id="stores">
              {stores.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <p className="hint">Use o mesmo nome que aparece nas ofertas para o cupom surgir na página dos produtos.</p>
          </div>
          <div className="field">
            <label htmlFor="discount">Desconto (opcional)</label>
            <input id="discount" name="discount" defaultValue={c?.discount || ""} placeholder="10% OFF ou R$ 50 OFF" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="title">Título</label>
          <input id="title" name="title" required defaultValue={c?.title} placeholder="10% em eletrônicos acima de R$ 500" />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="code">Código</label>
            <input id="code" name="code" defaultValue={c?.code || ""} placeholder="BLACK10" autoComplete="off" />
            <p className="hint">Deixe vazio para oferta sem código (o botão vira “Ativar oferta”).</p>
          </div>
          <div className="field">
            <label htmlFor="category">Categoria (opcional)</label>
            <input id="category" name="category" defaultValue={c?.category || ""} placeholder="Eletrônicos" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="description">Descrição curta (opcional)</label>
          <input id="description" name="description" defaultValue={c?.description || ""} />
        </div>
        <div className="field">
          <label htmlFor="rules">Regras (opcional)</label>
          <textarea id="rules" name="rules" rows={3} defaultValue={c?.rules || ""} placeholder="Válido para a primeira compra no app. Limite de R$ 100 de desconto." />
        </div>
      </fieldset>

      <fieldset>
        <legend>Links</legend>
        <div className="field">
          <label htmlFor="url">Link da loja</label>
          <input id="url" name="url" type="url" required defaultValue={c?.url} placeholder="https://www.amazon.com.br/..." />
        </div>
        <div className="field">
          <label htmlFor="affiliate_url">Link de afiliado (opcional)</label>
          <input id="affiliate_url" name="affiliate_url" type="url" defaultValue={c?.affiliate_url || ""} />
          <p className="hint">
            Se ficar vazio, usamos o link da loja. Links da Amazon recebem o seu código de afiliado automaticamente.
          </p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Validade e exibição</legend>
        <div className="field-row">
          <div className="field">
            <label htmlFor="starts_at">Começa em (opcional)</label>
            <input id="starts_at" name="starts_at" type="datetime-local" defaultValue={local(c?.starts_at ?? null)} />
          </div>
          <div className="field">
            <label htmlFor="expires_at">Vence em</label>
            <input id="expires_at" name="expires_at" type="datetime-local" defaultValue={local(c?.expires_at ?? null)} />
            <p className="hint">Horário de Brasília. Depois disso o cupom sai do site sozinho.</p>
          </div>
        </div>
        <label className="check">
          <input type="checkbox" name="highlight" defaultChecked={c?.highlight} /> Destacar no topo da página de cupons
        </label>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={c ? c.active : true} /> Ativo
        </label>
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="btn">
          {c ? "Salvar cupom" : "Criar cupom"}
        </button>
        <Link href="/admin/cupons" className="btn btn-ghost">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
