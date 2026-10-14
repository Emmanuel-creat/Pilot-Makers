import type { Indicator } from "@/lib/health-score";

const TONE: Record<string, string> = { A: "text-success", B: "text-success", C: "text-warning", D: "text-accent", E: "text-accent" };

/** Score, lettre et détail des indicateurs, communs à la page interne et au lien partagé. */
export function HealthReport({ score, grade, indicators, advice = true }: { score: number; grade: string; indicators: Indicator[]; advice?: boolean }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-4" data-testid="score-sante">
        <p className={`text-5xl font-semibold tabular-nums ${TONE[grade] ?? ""}`} aria-label={`Note ${grade}`}>
          {grade}
        </p>
        <p className="text-2xl font-semibold tabular-nums">
          {score} <span className="text-base font-normal text-muted">/ 100</span>
        </p>
      </div>
      <ul className="divide-y divide-border text-sm">
        {indicators.map((i) => (
          <li key={i.key} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-medium">{i.label}</span>
              <span className="tabular-nums">
                {i.value}{" "}
                <span className="text-muted">
                  ({i.points} / {i.max})
                </span>
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded bg-border" aria-hidden="true">
              <div className="h-1.5 rounded bg-accent" style={{ width: `${Math.round((i.points / i.max) * 100)}%` }} />
            </div>
            {advice && i.advice ? <p className="mt-2 text-muted">{i.advice}</p> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
