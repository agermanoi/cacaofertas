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

/** Quantas lojas aparecem antes do "ver todas" e quantos cupons por loja antes do "ver mais". */
const TOP_STORES = 12;
const PER_STORE = 3;

const anchor = (store: string) => `loja-${store.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-")}`;

export default async function Cupons() {
  const coupons = await getCoupons();
  const byStore = new Map<string, Coupon[]>();
  for (const c of coupons) {
    const list = byStore.get(c.store) || [];
    list.push(c);
    byStore.set(c.store, list);
  }
  const highlights = coupons.filter((c) => c.highlight).slice(0, 6);
  // Lojas com mais cupons com código primeiro
  const stores = [...byStore.entries()].sort(
    (a, b) =>
      b[1].filter((c) => c.code).length - a[1].filter((c) => c.code).length ||
      b[1].length - a[1].length ||
      a[0].localeCompare(b[0], "pt-BR")
  );
  const top = stores.slice(0, TOP_STORES);
  const rest = stores.slice(TOP_STORES).sort((a, b) => a[0].localeCompare(b[0], "pt-BR"));

  const chip = ([s, list]: [string, Coupon[]]) => (
    <a key={s} href={`#${anchor(s)}`}>
      {s} <span>{list.length}</span>
    </a>
  );

  return (
    <div className="wrap coupons-page">
      <header className="coupons-hero">
        <h1>Cupons de desconto</h1>
        <p className="lede">
          Cupons válidos hoje nas lojas parceiras. Os vencidos saem do ar sozinhos. Confira as regras antes de usar:
          muitos valem só para algumas categorias ou acima de um valor mínimo.
        </p>
        <p className="coupons-count">
          {coupons.length} cupons e ofertas em {stores.length} lojas
        </p>
        {stores.length ? (
          <nav className="coupon-stores" aria-label="Lojas com cupom">
            {top.map(chip)}
            {rest.length ? (
              <details className="coupon-stores-more">
                <summary>Ver todas as lojas ({stores.length})</summary>
                <div className="coupon-stores-all">{rest.map(chip)}</div>
              </details>
            ) : null}
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

      {stores.map(([store, list], i) => {
        // cupons com código primeiro, depois os que vencem antes
        const sorted = list.slice().sort((a, b) => Number(Boolean(b.code)) - Number(Boolean(a.code)));
        const first = sorted.slice(0, PER_STORE);
        const more = sorted.slice(PER_STORE);
        return (
          <section key={store} id={anchor(store)} className="coupon-store" aria-label={`Cupons ${store}`}>
            <h2>
              Cupons {store} <span className="coupon-store-n">{list.length}</span>
            </h2>
            <div className="coupon-grid">
              {first.map((c) => (
                <CouponCard key={c.id} c={c} expires={expiresLabel(c.expires_at)} />
              ))}
            </div>
            {more.length ? (
              <details className="coupon-more">
                <summary>
                  Ver mais {more.length} {more.length === 1 ? "cupom" : "cupons"} de {store}
                </summary>
                <div className="coupon-grid">
                  {more.map((c) => (
                    <CouponCard key={c.id} c={c} expires={expiresLabel(c.expires_at)} />
                  ))}
                </div>
              </details>
            ) : null}
            {i === 5 ? <AdSlot id="cupons-meio" format="infeed" /> : null}
          </section>
        );
      })}

      <p className="note">
        Alguns links são de afiliado: se você comprar por eles, a loja nos paga uma comissão e o preço para você não muda.
      </p>
    </div>
  );
}
