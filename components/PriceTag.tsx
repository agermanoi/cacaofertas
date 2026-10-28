import { moneyParts, money } from "@/lib/format";

/** A etiqueta amarela de prateleira. É o elemento de destaque do site. */
export function PriceTag({
  price,
  listPrice,
  store,
  size = "md",
}: {
  price: number;
  listPrice?: number | null;
  store?: string | null;
  size?: "md" | "lg";
}) {
  const { int, cents } = moneyParts(price);
  return (
    <div className={`tag tag-${size}`}>
      {listPrice && listPrice > price ? <s className="tag-from">de {money(listPrice)}</s> : null}
      <div className="tag-price" aria-label={money(price)}>
        <span className="tag-cur">R$</span>
        <span className="tag-int">{int}</span>
        <span className="tag-cents">,{cents}</span>
      </div>
      {store ? <div className="tag-store">em {store}</div> : null}
    </div>
  );
}
