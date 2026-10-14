import { notFound } from "next/navigation";
import { deleteInterventionAction, sendPlanningAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { timeline, tradeByKey } from "@/lib/coordination";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import { getCoordination } from "@/lib/services/coordination";
import { InterventionForm } from "./InterventionForm";

export const metadata = { title: "Coordination des corps de métier" };

export default async function CoordinationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const c = await getCoordination(ctx, id).catch((e) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const line = timeline(c.interventions);
  const label = (trade: string) => tradeByKey(trade)?.label ?? trade;
  const others = c.interventions.map((i) => ({ id: i.id, label: `${label(i.trade)} (${i.company})` }));
  const issuesFor = (iid: string) => c.issues.filter((x) => x.id === iid);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Coordination des corps de métier"
        back={{ href: `/app/chantiers/${id}`, label: c.job.title }}
        subtitle={c.job.planningSentAt ? `Planning envoyé aux intervenants le ${fmtDate(c.job.planningSentAt)}.` : "Qui intervient, quand, et dans quel ordre."}
      />
      <div className="space-y-6">
        {c.issues.length ? (
          <Notice tone="warning" title="Enchaînement à vérifier">
            <ul className="list-disc pl-5" data-testid="coordination-alertes">
              {c.issues.map((x, i) => (
                <li key={i}>{x.text}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <Section title="Interventions" description="Classées par date. La frise montre la période de chaque corps de métier.">
          {c.interventions.length ? (
            <>
              {line ? (
                <p className="mb-2 text-xs text-muted">
                  Du {fmtDate(line.from)} au {fmtDate(line.to)}
                </p>
              ) : null}
              <ul className="divide-y divide-line">
                {c.interventions.map((i) => {
                  const bar = line?.bars.get(i.id);
                  return (
                    <li key={i.id} className="space-y-2 py-3 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium">{label(i.trade)}</p>
                          <p className="text-xs text-muted">
                            {i.company}, {i.startDate && i.endDate ? `du ${fmtDate(i.startDate)} au ${fmtDate(i.endDate)}` : "dates à fixer"}
                            {i.note ? `. ${i.note}` : ""}
                          </p>
                        </div>
                        {canEdit ? (
                          <form action={deleteInterventionAction}>
                            <input type="hidden" name="id" value={i.id} />
                            <button
                              type="submit"
                              className="inline-flex min-h-6 min-w-6 items-center justify-center text-muted hover:text-danger"
                              aria-label={`Supprimer ${label(i.trade).toLowerCase()}`}
                            >
                              <Icon name="trash" size={16} />
                            </button>
                          </form>
                        ) : null}
                      </div>
                      {bar ? (
                        <div className="relative h-2 rounded bg-surface-2" aria-hidden="true">
                          <div
                            className={`absolute inset-y-0 rounded ${issuesFor(i.id).length ? "bg-warning" : "bg-accent"}`}
                            style={{ left: `${bar.left}%`, width: `${Math.max(bar.width, 1)}%` }}
                          />
                        </div>
                      ) : null}
                      {canEdit ? (
                        <details>
                          <summary className="link inline-flex min-h-6 cursor-pointer items-center text-xs">Modifier</summary>
                          <div className="mt-2">
                            <InterventionForm jobId={id} subcontractors={c.subcontractors} others={others} value={i} />
                          </div>
                        </details>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-muted">Aucune intervention planifiée. Ajoutez chaque corps de métier avec ses dates.</p>
          )}
        </Section>
        {canEdit ? (
          <Section title="Ajouter une intervention">
            <InterventionForm jobId={id} subcontractors={c.subcontractors} others={others} />
          </Section>
        ) : null}
        {canEdit && c.interventions.length ? (
          <Section
            title="Prévenir les intervenants"
            description={
              c.recipients.length
                ? `Le planning complet part par e-mail à ${c.recipients.map((r) => r.name).join(", ")}.`
                : "Ajoutez l'adresse e-mail des sous-traitants concernés dans leur fiche pour leur envoyer le planning."
            }
          >
            {c.recipients.length ? (
              <ActionForm action={sendPlanningAction}>
                <input type="hidden" name="jobId" value={id} />
                <Submit className="btn-secondary">
                  <Icon name="send" size={16} /> Envoyer le planning aux intervenants
                </Submit>
              </ActionForm>
            ) : null}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
