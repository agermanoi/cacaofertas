import type { ProductSpecs } from "@/lib/specs";

export function SpecSheet({ specs }: { specs: ProductSpecs }) {
  return (
    <section className="specs" aria-labelledby="ficha">
      <h2 id="ficha">Ficha técnica</h2>
      <p className="specs-summary">{specs.summary}</p>
      <dl className="specs-list">
        {specs.specs.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {specs.note ? <p className="specs-note">{specs.note}</p> : null}
    </section>
  );
}
