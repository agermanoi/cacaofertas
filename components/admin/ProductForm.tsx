import Link from "next/link";
import { saveProduct } from "@/app/admin/actions";
import { specLinesToText } from "@/lib/specs";
import type { Product } from "@/lib/types";

/** Formulário de cadastro e edição. Funciona sem JavaScript no navegador (server action). */
export function ProductForm({ product, categories }: { product?: Product | null; categories: string[] }) {
  const p = product;
  const isNew = !p;
  return (
    <form action={saveProduct} className="admin-form">
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      {p ? <input type="hidden" name="old_slug" value={p.slug} /> : null}

      <fieldset>
        <legend>Produto</legend>
        <div className="field">
          <label htmlFor="name">Nome</label>
          <input id="name" name="name" required defaultValue={p?.name} placeholder="Ex.: iPhone 16 128GB" />
          <p className="hint">Como aparece no site. Inclua modelo e capacidade, se houver.</p>
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="category">Categoria</label>
            <input id="category" name="category" required list="categorias" defaultValue={p?.category} />
            <datalist id="categorias">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="field">
            <label htmlFor="popularity">Posição em “mais buscados”</label>
            <input id="popularity" name="popularity" type="number" min="0" max="1000" defaultValue={p?.popularity ?? 50} />
            <p className="hint">Quanto maior, mais para cima na home.</p>
          </div>
        </div>
        <div className="field">
          <label htmlFor="slug">Endereço da página</label>
          <div className="prefix-input">
            <span>/produto/</span>
            <input id="slug" name="slug" defaultValue={p?.slug} placeholder="gerado a partir do nome" pattern="[a-z0-9-]*" />
          </div>
          <p className="hint">Deixe em branco para gerar pelo nome. Mudar o endereço de um produto já indexado faz ele perder posição no Google.</p>
        </div>
        <div className="field">
          <label htmlFor="image_url">Imagem (opcional)</label>
          <input id="image_url" name="image_url" type="url" defaultValue={p?.image_url ?? ""} placeholder="https://…" />
          <p className="hint">Em branco, a coleta usa a foto do primeiro anúncio encontrado.</p>
        </div>
        <label className="check">
          <input type="checkbox" name="active" defaultChecked={p ? p.active : true} />
          Mostrar no site e incluir na coleta
        </label>
      </fieldset>

      <fieldset>
        <legend>Busca nas lojas</legend>
        <div className="field">
          <label htmlFor="query">Termo de busca</label>
          <input id="query" name="query" defaultValue={p?.query} placeholder="Em branco, usa o nome" />
          <p className="hint">O que vai para o Mercado Livre, Google Shopping e Lomadee.</p>
        </div>
        <div className="field">
          <label htmlFor="must">Palavras obrigatórias no anúncio</label>
          <input id="must" name="must" defaultValue={p?.must?.join(", ")} placeholder="iphone, 16, 128" />
          <p className="hint">
            Separe por vírgula. <code>ps5|playstation 5</code> aceita uma ou outra. <code>~u8000f</code> procura o código do
            modelo mesmo grudado em outro texto.
          </p>
        </div>
        <div className="field">
          <label htmlFor="exclude">Palavras que descartam o anúncio</label>
          <input id="exclude" name="exclude" defaultValue={p?.exclude?.join(", ")} placeholder="capa, película, usado, recondicionado" />
        </div>
        <div className="field-row">
          <div className="field">
            <label htmlFor="min_price">Preço mínimo (R$)</label>
            <input id="min_price" name="min_price" inputMode="decimal" defaultValue={p?.min_price ?? ""} placeholder="0" />
            <p className="hint">Abaixo disso é acessório ou golpe.</p>
          </div>
          <div className="field">
            <label htmlFor="max_price">Preço máximo (R$, opcional)</label>
            <input id="max_price" name="max_price" inputMode="decimal" defaultValue={p?.max_price ?? ""} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="scrape_urls">Páginas de produto para raspar (opcional)</label>
          <textarea id="scrape_urls" name="scrape_urls" rows={3} defaultValue={p?.scrape_urls?.join("\n")} placeholder="https://www.kabum.com.br/produto/…" />
          <p className="hint">Uma URL por linha. Use para lojas que não aparecem nas APIs.</p>
        </div>
      </fieldset>

      <fieldset>
        <legend>Ficha técnica</legend>
        <div className="field">
          <label htmlFor="spec_summary">Resumo</label>
          <textarea id="spec_summary" name="spec_summary" rows={2} defaultValue={p?.specs?.summary} placeholder="Uma ou duas frases: para quem é e o que tem de diferente." />
        </div>
        <div className="field">
          <label htmlFor="spec_lines">Especificações</label>
          <textarea
            id="spec_lines"
            name="spec_lines"
            rows={8}
            defaultValue={specLinesToText(p?.specs?.specs)}
            placeholder={"Tela: 6,1\" OLED, 60 Hz\nChip: Apple A18\nBateria: até 22 h de vídeo"}
          />
          <p className="hint">Uma por linha, no formato “Rótulo: valor”.</p>
        </div>
        <div className="field">
          <label htmlFor="spec_note">Aviso ao comprador (opcional)</label>
          <input id="spec_note" name="spec_note" defaultValue={p?.specs?.note} placeholder="Ex.: confira se é a versão com 16 GB de RAM." />
        </div>
        {p && !p.specs ? (
          <p className="hint">Sem ficha salva aqui, a página usa a do arquivo data/specs.json, se existir.</p>
        ) : null}
      </fieldset>

      <div className="form-actions">
        <button type="submit" className="btn">
          {isNew ? "Cadastrar produto" : "Salvar alterações"}
        </button>
        <label className="check">
          <input type="checkbox" name="coletar" defaultChecked={isNew} />
          Coletar preços logo depois de salvar
        </label>
        <Link href="/admin" className="btn btn-ghost">
          Cancelar
        </Link>
      </div>
    </form>
  );
}
