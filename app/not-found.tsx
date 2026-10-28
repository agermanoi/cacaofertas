import Link from "next/link";

export default function NotFound() {
  return (
    <div className="wrap page-text">
      <h1>Produto não encontrado</h1>
      <p>Ele pode ter saído da lista de monitorados. Veja os produtos que acompanhamos agora.</p>
      <p>
        <Link href="/" className="btn">
          Ver todos os produtos
        </Link>
      </p>
    </div>
  );
}
