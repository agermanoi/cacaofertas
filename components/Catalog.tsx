"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { DailyPoint, ProductOverview } from "@/lib/types";
import type { Verdict } from "@/lib/verdict";
import { Sparkline } from "./Sparkline";
import { VerdictBadge } from "./VerdictBadge";
import { AdSlot } from "./AdSlot";

/** Anúncios in-feed depois destas posições da lista (1 = primeira linha). */
const INFEED_AFTER = [6, 14];

export interface CatalogItem {
  product: ProductOverview;
  verdict: Verdict;
  series: DailyPoint[];
}

type Sort = "popular" | "drop" | "price";

const brl = (v: number | null) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function Catalog({
  items,
  title = "Os mais buscados",
  showCategories = true,
}: {
  items: CatalogItem[];
  title?: string;
  showCategories?: boolean;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("Todos");
  const [sort, setSort] = useState<Sort>("popular");

  const categories = useMemo(() => ["Todos", ...Array.from(new Set(items.map((i) => i.product.category)))], [items]);

  const list = useMemo(() => {
    const nq = norm(q.trim());
    const filtered = items.filter(
      (i) => (cat === "Todos" || i.product.category === cat) && (!nq || norm(i.product.name).includes(nq))
    );
    const sorted = [...filtered];
    if (sort === "drop") sorted.sort((a, b) => (b.verdict.vsAvg ?? -9) - (a.verdict.vsAvg ?? -9));
    if (sort === "price") sorted.sort((a, b) => Number(a.product.best_price ?? 1e12) - Number(b.product.best_price ?? 1e12));
    return sorted;
  }, [items, q, cat, sort]);

  return (
    <section className="catalog" aria-labelledby="catalog-title">
      <div className="catalog-head">
        <h2 id="catalog-title">{title}</h2>
        <div className="controls">
          <label className="search">
            <span className="sr-only">Buscar produto</span>
            <input
              type="search"
              placeholder="Buscar: iPhone, air fryer, PS5…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label className="sort">
            <span className="sr-only">Ordenar</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="popular">Mais buscados</option>
              <option value="drop">Maior queda real</option>
              <option value="price">Menor preço</option>
            </select>
          </label>
        </div>
      </div>

      {showCategories ? (
        <nav className="chips" aria-label="Filtrar por categoria">
          {categories.map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </nav>
      ) : null}

      {list.length ? (
        <ol className="rows">
          {list.map(({ product: p, verdict, series }, i) => (
            <Fragment key={p.id}>
            <li>
              <Link href={`/produto/${p.slug}`} className="row">
                <span className="row-img">
                  {p.image_url ? <img src={p.image_url} alt="" loading="lazy" /> : null}
                </span>
                <span className="row-main">
                  <span className="row-name">{p.name}</span>
                  <span className="row-meta">
                    {p.best_store ? `${p.offers_count} ofertas, melhor em ${p.best_store}` : p.category}
                  </span>
                </span>
                <span className="row-spark">
                  <Sparkline points={series} />
                </span>
                <span className="row-verdict">
                  <VerdictBadge verdict={verdict} />
                </span>
                <span className="row-price">{brl(p.best_price)}</span>
              </Link>
            </li>
            {INFEED_AFTER.includes(i + 1) && i + 1 < list.length ? (
              <li className="row-ad">
                <AdSlot id={`home-lista-${INFEED_AFTER.indexOf(i + 1) + 1}`} format="infeed" />
              </li>
            ) : null}
            </Fragment>
          ))}
        </ol>
      ) : (
        <p className="empty">
          Nada encontrado para “{q}”. Tente outro termo ou escolha “Todos” nas categorias.
        </p>
      )}
    </section>
  );
}
