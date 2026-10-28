import type { Metadata } from "next";
import { getCoupons, expiresLabel, type Coupon } from "@/lib/coupons";
import { CouponCard } from "@/components/CouponCard";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 900;

export const metadata: Metadata = {
  title: "Cupons de desconto para a Black Friday",
  description: "Cupons de desconto válidos hoje nas principais lojas, com validade e regras. Atualizado várias vezes por dia.",
  alternates: { canonical: "/cupons" },
};

export default async function Cupons() {
  const coupons = await getCoupons();
  const byStore = new Map<string, Coupon[]>();
  for (const c of coupons) {
    const list = byStore.get(c.store) || [];
    list.push(c);
    byStore.set(c.store, list);
  }
  const highlights = coupons.filter((c) => c.highlight).slice(0, 6);
  const stores = [...byStore.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"));

  return (
    <div className="wrap coupons-page">
      <header className="coupons-hero">
        <h1>Cupons de desconto</h1>
        <p className="lede">
          Cupons válidos hoje nas lojas que acompanhamos. Os vencidos saem do ar sozinhos. Confira as regras antes de
          usar: muitos valem só para algumas categorias ou acima de um valor mínimo.
        </p>
        {stores.length ? (
          <nav className="coupon-stores" aria-label="Lojas com cupom">
            {stores.map(([s, list]) => (
              <a key={s} href={`#loja-${encodeURIComponent(s)}`}>
                {s} <span>{list.length}</span>
              </a>
            ))}
          </nav>
        ) : null}
      </header>

      {!coupons.length ? (
        <p className="empty">Nenhum cupom válido agora. Volte mais perto da Black Friday: novos cupons entram todos os dias.</p>
      ) : null}

      {highlights.length ? (
        <section aria-labelledby="destaques">
          <h2 id="destaques">Destaques</h2>
          <div className="coupon-grid">
            {highlights.map((c) => (
              <CouponCard key={c.id} c={c} expires={expiresLabel(c.expires_at)} />
            ))}
          </div>
        </section>
      ) : null}

      <AdSlot id="cupons-topo" format="leaderboard" />

      {stores.map(([store, list]) => (
        <section key={store} id={`loja-${encodeURIComponent(store)}`} aria-label={`Cupons ${store}`}>
          <h2>Cupons {store}</h2>
          <div className="coupon-grid">
            {list.map((c) => (
              <CouponCard key={c.id} c={c} expires={expiresLabel(c.expires_at)} />
            ))}
          </div>
        </section>
      ))}

      <p className="note">
        Alguns links são de afiliado: se você comprar por eles, a loja nos paga uma comissão e o preço para você não muda.
      </p>
    </div>
  );
}
