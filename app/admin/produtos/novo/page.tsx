import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import { Flash } from "@/components/admin/Flash";
import { adminCategories } from "@/lib/admin-data";

type Props = { searchParams: Promise<{ erro?: string }> };

export default async function NewProductPage({ searchParams }: Props) {
  const { erro } = await searchParams;
  const categories = await adminCategories();
  return (
    <div className="wrap admin-page">
      <nav className="crumbs">
        <Link href="/admin">Produtos</Link> <span aria-hidden="true">/</span> Novo
      </nav>
      <h1>Novo produto</h1>
      <Flash erro={erro} />
      <ProductForm categories={categories} />
    </div>
  );
}
