import { notFound } from "next/navigation";
import { safetyPlanAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { HttpError } from "@/lib/http";
import { RISKS } from "@/lib/safety";
import { requirePageCtx } from "@/lib/server/session";
import { getSafetyPlan } from "@/lib/services/safety";

export const metadata = { title: "Plan de prévention" };

export default async function SafetyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const s = await getSafetyPlan(ctx, id).catch((e) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const { plan } = s;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Plan de prévention"
        back={{ href: `/app/chantiers/${id}`, label: s.job.title }}
        subtitle={s.saved && s.updatedAt ? `Mis à jour le ${fmtDate(s.updatedAt)}` : "Risques proposés d'après les travaux du chantier, à vérifier."}
        actions={
          s.saved ? (
            <a className="btn-secondary" href={`/api/jobs/${id}/prevention`} target="_blank" rel="noopener">
              <Icon name="download" size={16} /> Plan à afficher (PDF)
            </a>
          ) : null
        }
      />
      <div className="space-y-6">
        {s.surveys.length ? (
          <Notice tone="warning" title="Avant de commencer">
            <ul className="list-disc pl-5">
              {s.surveys.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
        <ActionForm action={safetyPlanAction} className="space-y-6">
          <input type="hidden" name="jobId" value={id} />
          <fieldset disabled={!canEdit} className="space-y-6">
            <Section
              title="Risques du chantier"
              description="Chaque risque retenu figure dans le plan avec ses mesures de prévention et les protections à porter."
            >
              <ul className="grid gap-3 sm:grid-cols-2">
                {RISKS.map((r) => (
                  <li key={r.key}>
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="risks" value={r.key} className="mt-0.5 h-4 w-4" defaultChecked={plan.risks.includes(r.key)} />
                      <span>
                        <span className="font-medium">{r.label}</span>
                        {s.suggested.includes(r.key) ? <span className="block text-xs text-muted">Proposé d'après les travaux</span> : null}
                        <span className="block text-xs text-muted">{r.measures[0]}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </Section>
            <Section title="Secours et responsables">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="sp-manager">
                    Responsable du chantier
                  </label>
                  <input id="sp-manager" name="manager" className="field" maxLength={160} defaultValue={plan.manager} required />
                </div>
                <div>
                  <label className="label" htmlFor="sp-aider">
                    Sauveteur secouriste du travail
                  </label>
                  <input id="sp-aider" name="firstAider" className="field" maxLength={160} defaultValue={plan.firstAider} />
                </div>
                <div>
                  <label className="label" htmlFor="sp-hospital">
                    Hôpital le plus proche
                  </label>
                  <input
                    id="sp-hospital"
                    name="hospital"
                    className="field"
                    maxLength={300}
                    defaultValue={plan.hospital}
                    placeholder="Nom et adresse des urgences"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="sp-meeting">
                    Point de rassemblement
                  </label>
                  <input id="sp-meeting" name="meetingPoint" className="field" maxLength={300} defaultValue={plan.meetingPoint} />
                </div>
                <div>
                  <label className="label" htmlFor="sp-year">
                    Année de construction du bâtiment
                  </label>
                  <input
                    id="sp-year"
                    name="buildingYear"
                    inputMode="numeric"
                    className="field"
                    maxLength={4}
                    defaultValue={plan.buildingYear ?? ""}
                    placeholder="Ex. : 1975"
                  />
                  <p className="mt-1 text-xs text-muted">Avant 1997, un repérage amiante est obligatoire ; avant 1949, un constat plomb.</p>
                </div>
              </div>
              <div className="mt-3">
                <label className="label" htmlFor="sp-instructions">
                  Consignes propres au chantier
                </label>
                <textarea
                  id="sp-instructions"
                  name="instructions"
                  rows={4}
                  maxLength={4000}
                  className="field"
                  defaultValue={plan.instructions}
                  placeholder="Ex. : occupants présents, accès par la cour, compteur d'eau dans le placard de l'entrée."
                />
              </div>
            </Section>
            <Section title="Intervenants">
              <p className="text-sm">
                <span className="font-medium">Équipe : </span>
                {s.team.join(", ") || "personne n'est encore planifié sur ce chantier"}.
              </p>
              <p className="mt-1 text-sm">
                <span className="font-medium">Autres entreprises : </span>
                {s.companies.join(", ") || "aucune"}.
              </p>
              <p className="mt-2 text-xs text-muted">Le plan reprend ces noms dans la liste d'émargement : chacun le lit et le signe avant de commencer.</p>
            </Section>
            {canEdit ? <Submit>Enregistrer le plan</Submit> : null}
          </fieldset>
        </ActionForm>
      </div>
    </div>
  );
}
