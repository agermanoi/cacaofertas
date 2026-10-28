import type { DailyPoint } from "@/lib/types";

/** Mini gráfico de 30 dias. A bolinha marca o preço mais recente. */
export function Sparkline({ points, width = 120, height = 32 }: { points: DailyPoint[]; width?: number; height?: number }) {
  if (points.length < 2) {
    return (
      <svg className="spark" width={width} height={height} aria-hidden="true">
        <line x1="0" x2={width} y1={height / 2} y2={height / 2} className="spark-empty" />
      </svg>
    );
  }
  const values = points.map((p) => p.min_price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];

  return (
    <svg
      className="spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Variação em ${points.length} dias: mínimo ${min.toFixed(0)}, máximo ${max.toFixed(0)}`}
    >
      <path d={d} className="spark-line" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="3" className={last <= min ? "spark-dot low" : "spark-dot"} />
    </svg>
  );
}
