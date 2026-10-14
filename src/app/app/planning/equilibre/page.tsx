import { moveAssignmentAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section } from "@/components/ui";
import type { LoadStatus } from "@/lib/balance";
import { requirePageCtx } from "@/lib/server/session";
import { teamBalance } from "@/lib/services/balance";

export const metadata = { title: "Équilibre de charge" };

const STATUS: Record<LoadStatus, { label: string; tone: string }> = {
  surcharge: { label: "Surcharge", tone: "text-accent" },
  chargé: { label: "Chargé", tone: "text-warning" },
  équilibré: { label: "Équilibré", tone: "text-success" },
  disponible: { label: "Disponible", tone: "text-muted" },
};

const fr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const pct = (v: number) => `${Math.round(v * 100)} %`;

export default async function BalancePage() {
  const ctx = await requirePageCtx();
  const b = await teamBalance(ctx);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Équilibre de charge"
        subtitle={`Occupation de chaque personne du ${fr(b.from)} au ${fr(b.to)}, jours ouvrés hors absences.`}
        back={{ href: "/app/planning", label: "Planning" }}
      />
      <div className="space-y-6">
        <Section
          title="Charge par personne"
          description={
            b.loads.length > 1
              ? `Écart entre la personne la plus chargée et la moins chargée : ${Math.round(b.spread * 100)} points${b.spread > 0.3 ? ", la répartition peut être rééquilibrée." : "."}`
              : undefined
          }
        >
          {b.loads.length ? (
            <ul className="divide-y divide-border text-sm" data-testid="charge-equipe">
              {b.loads.map((l) => (
                <li key={l.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{l.name}</span>
                    <span className="tabular-nums">
                      <span className={`font-medium ${STATUS[l.status].tone}`}>{STATUS[l.status].label}</span>
                      <span className="text-muted">
                        {" "}
                        {l.plannedDays} / {l.capacityDays} jours, {pct(l.rate)}
                      </span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded bg-border" aria-hidden="true">
                    <div className="h-1.5 rounded bg-accent" style={{ width: `${Math.min(100, Math.round(l.rate * 100))}%` }} />
                  </div>
                  {l.reasons.length ? <p className="mt-2 text-muted">{l.reasons.join(", ")}.</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="team" title="Aucune personne à planifier" />
          )}
        </Section>

        <Section title="Réaffectations proposées" description="Chaque proposition vise une personne présente et libre sur toute la période de l'affectation.">
          {b.suggestions.length ? (
            <ul className="divide-y divide-border text-sm" data-testid="reaffectations">
              {b.suggestions.map((s) => (
                <li key={s.assignmentId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                  <span>
                    <span className="font-medium">{s.jobTitle}</span>
                    <span className="block text-muted">
                      Du {fr(s.start)} au {fr(s.end)} ({s.days} jour{s.days > 1 ? "s" : ""}) : de {s.fromName} vers {s.toName}
                    </span>
                  </span>
                  {writable ? (
                    <ActionForm action={moveAssignmentAction}>
                      <input type="hidden" name="id" value={s.assignmentId} />
                      <input type="hidden" name="resource" value={`user:${s.toId}`} />
                      <input type="hidden" name="start" value={s.start} />
                      <Submit className="btn-secondary">Confier à {s.toName}</Submit>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              {b.overloaded ? "Personne n'est libre pour reprendre les affectations en surcharge." : "Aucune surcharge sur la période."}
            </p>
          )}
        </Section>
      </div>
    </div>
  );
}
