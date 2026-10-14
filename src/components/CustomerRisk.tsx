import { RISK_LEVELS, type RiskLevel, type RiskResult } from "@/lib/customer-risk";

const TONE: Record<RiskLevel, string> = { faible: "text-success", modere: "text-warning", eleve: "text-danger" };

/** Risque d'impayé du client et garanties conseillées. */
export function CustomerRisk({ risk, note }: { risk: RiskResult; note?: string | null }) {
  return (
    <section className="card mt-6 space-y-2 p-4 text-sm" data-testid="risque-client">
      <h2 className="text-sm font-semibold">Risque d&apos;impayé</h2>
      <p>
        <span className={`font-semibold ${TONE[risk.level]}`}>{RISK_LEVELS[risk.level]}</span>
        <span className="text-muted"> ({risk.score} / 100)</span>
      </p>
      {risk.reasons.length ? <p className="text-xs text-muted">{risk.reasons.join(", ")}.</p> : null}
      {note ? <p className="text-xs font-medium text-warning">{note}</p> : null}
      <ul className="list-disc space-y-1 pl-5 text-muted">
        {risk.guarantees.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
    </section>
  );
}
