"use client";

import { useMemo, useState } from "react";
import type { DailyPoint } from "@/lib/types";

interface Series {
  store: string;
  points: DailyPoint[];
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Gráfico de histórico: linha grossa = menor preço do dia entre todas as lojas;
 * linhas finas = cada loja (até 4). Linha tracejada = média do período.
 */
export function PriceChart({ best, stores }: { best: DailyPoint[]; stores: Series[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const [showStores, setShowStores] = useState(false);

  const W = 720;
  const H = 280;
  const M = { t: 16, r: 16, b: 28, l: 64 };

  const shown = stores.slice(0, 4);
  const days = best.map((p) => p.day);

  const { min, max, avg } = useMemo(() => {
    const all = [...best, ...(showStores ? shown.flatMap((s) => s.points) : [])].map((p) => p.min_price);
    const mn = Math.min(...all);
    const mx = Math.max(...all);
    const pad = (mx - mn) * 0.12 || mx * 0.05;
    const a = best.reduce((s, p) => s + p.min_price, 0) / best.length;
    return { min: mn - pad, max: mx + pad, avg: a };
  }, [best, shown, showStores]);

  if (best.length < 2) {
    return (
      <div className="chart-empty">
        O gráfico aparece depois da segunda coleta. Os preços são verificados duas vezes por dia.
      </div>
    );
  }

  const x = (i: number) => M.l + (i / (days.length - 1)) * (W - M.l - M.r);
  const y = (v: number) => M.t + (1 - (v - min) / (max - min)) * (H - M.t - M.b);
  const pathFor = (pts: DailyPoint[]) => {
    const idx = new Map(days.map((d, i) => [d, i]));
    return pts
      .filter((p) => idx.has(p.day))
      .map((p, k) => `${k ? "L" : "M"}${x(idx.get(p.day)!).toFixed(1)},${y(p.min_price).toFixed(1)}`)
      .join(" ");
  };

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);
  const xEvery = Math.max(1, Math.ceil(days.length / 6));
  const h = hover != null ? best[hover] : null;

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.l) / (W - M.l - M.r)) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  }

  return (
    <figure className="chart">
      <div className="chart-head">
        <figcaption>
          {h ? (
            <>
              <strong>{brl(h.min_price)}</strong> em {ddmm(h.day)}
            </>
          ) : (
            <>Menor preço do dia entre todas as lojas</>
          )}
        </figcaption>
        {shown.length > 1 ? (
          <label className="chart-toggle">
            <input type="checkbox" checked={showStores} onChange={(e) => setShowStores(e.target.checked)} />
            Mostrar por loja
          </label>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="chart-svg"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`Histórico de ${days.length} dias. Mínimo ${brl(Math.min(...best.map((p) => p.min_price)))}, média ${brl(avg)}.`}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={W - M.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={M.l - 8} y={y(v) + 4} className="axis" textAnchor="end">
              {Math.round(v).toLocaleString("pt-BR")}
            </text>
          </g>
        ))}
        {days.map((d, i) =>
          i % xEvery === 0 || i === days.length - 1 ? (
            <text key={d} x={x(i)} y={H - 8} className="axis" textAnchor="middle">
              {ddmm(d)}
            </text>
          ) : null
        )}

        <line x1={M.l} x2={W - M.r} y1={y(avg)} y2={y(avg)} className="avg" />
        <text x={W - M.r} y={y(avg) - 6} className="axis avg-label" textAnchor="end">
          média {brl(avg)}
        </text>

        {showStores
          ? shown.map((s, i) => <path key={s.store} d={pathFor(s.points)} className={`store-line s${i}`} />)
          : null}
        <path d={pathFor(best)} className="best-line" />

        {h && hover != null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={M.t} y2={H - M.b} className="cursor" />
            <circle cx={x(hover)} cy={y(h.min_price)} r="5" className="cursor-dot" />
          </g>
        ) : null}
      </svg>

      {showStores ? (
        <ul className="legend">
          {shown.map((s, i) => (
            <li key={s.store}>
              <span className={`swatch s${i}`} />
              {s.store}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  );
}
