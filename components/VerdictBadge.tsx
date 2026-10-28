import type { Verdict } from "@/lib/verdict";

export function VerdictBadge({ verdict, withDetail = false }: { verdict: Verdict; withDetail?: boolean }) {
  return (
    <div className={`verdict v-${verdict.kind}`}>
      <span className="verdict-label">{verdict.label}</span>
      {withDetail ? <span className="verdict-detail">{verdict.detail}</span> : null}
    </div>
  );
}
