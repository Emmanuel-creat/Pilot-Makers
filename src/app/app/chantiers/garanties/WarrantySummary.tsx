import { fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import type { WarrantyRow } from "@/lib/services/warranties";
import { RETENTION_STATES, type RetentionState, type WarrantyState } from "@/lib/warranties";
import { ReleaseRetentionForm } from "./ReleaseForm";

const PERIOD_TONE: Record<WarrantyState, string> = { en_cours: "text-success", bientot: "text-warning", terminee: "text-muted" };
const RETENTION_TONE: Record<RetentionState, string> = { aucune: "text-muted", retenue: "text-muted", liberable: "text-warning", liberee: "text-success" };

function periodText(p: WarrantyRow["periods"][number]) {
  if (p.state === "terminee") return `Terminée le ${fmtDate(p.end)}`;
  return `Jusqu'au ${fmtDate(p.end)}${p.state === "bientot" ? ` (${p.daysLeft} j)` : ""}`;
}

/** Les trois garanties et la retenue de garantie d'un chantier réceptionné. */
export function WarrantySummary({ w, canEdit }: { w: WarrantyRow; canEdit: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
        {w.periods.map((p) => (
          <div key={p.key} className="contents">
            <dt className="font-medium" title={p.covers}>
              {p.label}
            </dt>
            <dd className={PERIOD_TONE[p.state]}>{periodText(p)}</dd>
          </div>
        ))}
        <dt className="font-medium">Retenue de garantie</dt>
        <dd className={RETENTION_TONE[w.retention.state]} data-testid="retention-state">
          {w.retention.state === "aucune"
            ? RETENTION_STATES.aucune
            : `${formatEuros(w.retention.cents)}, ${
                w.retention.state === "liberee"
                  ? `libérée le ${fmtDate(w.retention.releasedAt!)}${w.retention.note ? ` (${w.retention.note})` : ""}`
                  : w.retention.state === "liberable"
                    ? `à réclamer depuis le ${fmtDate(w.retention.releaseDate)}`
                    : `libérable le ${fmtDate(w.retention.releaseDate)}`
              }`}
        </dd>
      </dl>
      {w.retention.state === "liberable" && w.openReserves ? (
        <p className="text-xs text-warning">
          {w.openReserves} réserve{w.openReserves > 1 ? "s" : ""} encore à lever : le client peut s&apos;opposer à la libération tant qu&apos;elles ne sont pas
          levées.
        </p>
      ) : null}
      {canEdit && (w.retention.state === "liberable" || w.retention.state === "retenue") ? <ReleaseRetentionForm jobId={w.jobId} title={w.title} /> : null}
    </div>
  );
}
