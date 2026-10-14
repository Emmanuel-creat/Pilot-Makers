import { interventionAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { TRADES } from "@/lib/coordination";
import type { JobIntervention } from "@/lib/services/coordination";

/** Ajout ou modification d'une intervention : corps de métier, entreprise, dates et intervention qui doit la précéder. */
export function InterventionForm({
  jobId,
  subcontractors,
  others,
  value,
}: {
  jobId: string;
  subcontractors: { id: string; name: string; trade: string }[];
  others: { id: string; label: string }[];
  value?: JobIntervention;
}) {
  const p = value ? `iv-${value.id.slice(0, 8)}` : "iv-new";
  return (
    <ActionForm action={interventionAction} resetOnSuccess={!value} className="space-y-3">
      <input type="hidden" name="jobId" value={jobId} />
      {value ? <input type="hidden" name="id" value={value.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor={`${p}-trade`}>
            Corps de métier
          </label>
          <select id={`${p}-trade`} name="trade" className="field" defaultValue={value?.trade ?? "demolition"}>
            {TRADES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${p}-sub`}>
            Entreprise
          </label>
          <select id={`${p}-sub`} name="subcontractorId" className="field" defaultValue={value?.subcontractorId ?? ""}>
            <option value="">Notre équipe</option>
            {subcontractors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.trade ? ` (${s.trade})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${p}-start`}>
            Début
          </label>
          <input id={`${p}-start`} name="startDate" type="date" className="field" defaultValue={value?.startDate ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-end`}>
            Fin
          </label>
          <input id={`${p}-end`} name="endDate" type="date" className="field" defaultValue={value?.endDate ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor={`${p}-after`}>
            Après
          </label>
          <select id={`${p}-after`} name="afterId" className="field" defaultValue={value?.afterId ?? ""}>
            <option value="">Aucune intervention</option>
            {others
              .filter((o) => o.id !== value?.id)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${p}-note`}>
            Note
          </label>
          <input id={`${p}-note`} name="note" className="field" maxLength={300} defaultValue={value?.note ?? ""} placeholder="Ex. : séchage de la chape 48 h" />
        </div>
      </div>
      <Submit className="btn-secondary">{value ? "Enregistrer" : "Ajouter l'intervention"}</Submit>
    </ActionForm>
  );
}
