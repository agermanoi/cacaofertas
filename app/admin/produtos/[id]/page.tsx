import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import { Flash } from "@/components/admin/Flash";
import { adminCategories, adminGetProduct, adminRecentOffers } from "@/lib/admin-data";
import { deleteProduct } from "../../actions";
import { money } from "@/lib/format";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; erro?: string }> };

const SOURCE: Record<string, string> = {
  mercadolivre: "Mercado Livre API",
  amazon: "Amazon (SerpAPI)",
  serpapi: "Google Shopping",
  lomadee: "Lomadee",
  scraper: "Raspagem",
};

export default async function EditProductPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { ok, erro } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [product, categories, offers] = await Promise.all([adminGetProduct(id), adminCategories(), adminRecentOffers(id)]);
  if (!product) notFound();

  return (
    <div className="wrap admin-page">
      <nav className="crumbs">
        <Link href="/admin">Produtos</Link> <span aria-hidden="true">/</span> Editar
      </nav>
      <div className="admin-bar">
        <h1>{product.name}</h1>
        {product.active ? (
          <Link href={`/produto/${product.slug}`} className="btn btn-ghost" target="_blank">
            Ver no site
          </Link>
        ) : null}
      </div>
      <Flash ok={ok} erro={erro} />

      <ProductForm product={product} categories={categories} />

      <section className="admin-section" aria-labelledby="ofertas-recentes">
        <h2 id="ofertas-recentes">Anúncios aceitos na última coleta</h2>
        <p className="hint">
          Confira se estes anúncios são mesmo do produto. Se aparecer acessório ou modelo errado, ajuste as palavras
          obrigatórias, as que descartam ou o preço mínimo.
        </p>
        {offers.length ? (
          <div className="table-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Loja</th>
                  <th scope="col">Anúncio</th>
                  <th scope="col">Fonte</th>
                  <th scope="col" className="num">
                    Preço
                  </th>
                </tr>
              </thead>
              <tbody>
                {offers.map((o) => (
                  <tr key={o.id}>
                    <td>{o.store}</td>
                    <td>
                      <a href={o.url} target="_blank" rel="noopener noreferrer">
                        {o.title}
                      </a>
                    </td>
                    <td className="admin-meta">{SOURCE[o.source] ?? o.source}</td>
                    <td className="num">{money(o.last_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">Nenhum anúncio nos últimos 3 dias. Rode a coleta ou afrouxe os filtros.</p>
        )}
      </section>

      <section className="admin-section danger" aria-labelledby="remover">
        <h2 id="remover">Remover produto</h2>
        <p>
          Para tirar do site temporariamente, desmarque “Mostrar no site” e salve: o histórico continua guardado. Remover
          apaga o produto, as ofertas e todo o histórico de preços, e não dá para desfazer.
        </p>
        <details>
          <summary className="btn btn-danger-ghost">Remover {product.name}</summary>
          <form action={deleteProduct} className="confirm-box">
            <input type="hidden" name="id" value={product.id} />
            <p>Tem certeza? O histórico de {product.name} será apagado.</p>
            <button type="submit" className="btn btn-danger">
              Remover definitivamente
            </button>
          </form>
        </details>
      </section>
    </div>
  );
}
