import { addRentalAction, deleteRentalAction, returnRentalAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { RENTAL_PERIODS, RENTAL_STATES, rentalCost, rentalsTotal, rentalState, type Rental } from "@/lib/rentals";

const TONE = { a_venir: "text-muted", en_cours: "text-accent", en_retard: "text-danger", rendu: "text-success" } as const;

/** Matériel loué pour le chantier : coût engagé, retours en retard, restitution qui reporte le coût réel. */
export function RentalSection({ jobId, rentals, canEdit, today }: { jobId: string; rentals: Rental[]; canEdit: boolean; today: string }) {
  const total = rentalsTotal(rentals, today);
  return (
    <Section title="Location de matériel" description="Le coût court jusqu'au retour du matériel ; au retour, il s'ajoute aux coûts du chantier.">
      {rentals.length ? (
        <div className="space-y-3">
          <p className="text-sm" data-testid="bilan-locations">
            Coût des locations : {formatEuros(total.totalCents)} HT
            {total.overrunCents ? `, dont ${formatEuros(total.overrunCents)} dus aux retards` : ""}.
          </p>
          <ul className="divide-y divide-line text-sm">
            {rentals.map((r) => {
              const state = rentalState(r, today);
              const cost = rentalCost(r, today);
              return (
                <li key={r.id} className="space-y-2 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {r.equipment}
                        {r.renter ? <span className="font-normal text-muted">{`, ${r.renter}`}</span> : null}
                      </p>
                      <p className="text-xs text-muted">
                        Du {fmtDate(r.startDate)} au {fmtDate(r.endDate)}
                        {r.returnedOn ? `, rendu le ${fmtDate(r.returnedOn)}` : ""}, {formatEuros(r.rateCents)} {RENTAL_PERIODS[r.period].label}
                        {r.reference ? `, contrat ${r.reference}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xs font-medium ${TONE[state]}`}>{RENTAL_STATES[state]}</p>
                      <p className="tabular">
                        {formatEuros(cost.totalCents)} HT{" "}
                        <span className="text-xs text-muted">
                          ({cost.days} j{cost.overrunCents ? `, +${formatEuros(cost.overrunCents)} de retard` : ""})
                        </span>
                      </p>
                    </div>
                  </div>
                  {canEdit && !r.returnedOn ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <ActionForm action={returnRentalAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={r.id} />
                        <div>
                          <label className="label" htmlFor={`ret-${r.id}`}>
                            Rendu le
                          </label>
                          <input id={`ret-${r.id}`} name="date" type="date" className="field" defaultValue={today} max={today} required />
                        </div>
                        <Submit className="btn-secondary">Matériel rendu</Submit>
                      </ActionForm>
                      <form action={deleteRentalAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button
                          type="submit"
                          className="inline-flex min-h-9 min-w-9 items-center justify-center text-muted hover:text-danger"
                          aria-label={`Supprimer la location ${r.equipment}`}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </form>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted">Aucun matériel loué pour ce chantier.</p>
      )}
      {canEdit ? (
        <ActionForm action={addRentalAction} resetOnSuccess className="mt-4 space-y-3 border-t border-line pt-4">
          <input type="hidden" name="jobId" value={jobId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="rt-eq">
                Matériel loué
              </label>
              <input id="rt-eq" name="equipment" className="field" maxLength={200} placeholder="Ex. : mini-pelle 2,5 t, échafaudage roulant" required />
            </div>
            <div>
              <label className="label" htmlFor="rt-renter">
                Loueur
              </label>
              <input id="rt-renter" name="renter" className="field" maxLength={120} />
            </div>
            <div>
              <label className="label" htmlFor="rt-start">
                Début de location
              </label>
              <input id="rt-start" name="startDate" type="date" className="field" defaultValue={today} required />
            </div>
            <div>
              <label className="label" htmlFor="rt-end">
                Retour prévu
              </label>
              <input id="rt-end" name="endDate" type="date" className="field" defaultValue={today} required />
            </div>
            <div>
              <label className="label" htmlFor="rt-ref">
                N° de contrat
              </label>
              <input id="rt-ref" name="reference" className="field" maxLength={80} />
            </div>
            <div>
              <label className="label" htmlFor="rt-rate">
                Tarif HT (€)
              </label>
              <input id="rt-rate" name="rate" inputMode="decimal" className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="rt-period">
                Tarif
              </label>
              <select id="rt-period" name="period" className="field" defaultValue="jour">
                {Object.entries(RENTAL_PERIODS).map(([k, p]) => (
                  <option key={k} value={k}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rt-delivery">
                Transport HT (€)
              </label>
              <input id="rt-delivery" name="delivery" inputMode="decimal" className="field" />
            </div>
            <div>
              <label className="label" htmlFor="rt-ins">
                Assurance casse (%)
              </label>
              <input id="rt-ins" name="insurance" inputMode="decimal" className="field" placeholder="Ex. : 10" />
            </div>
          </div>
          <Submit className="btn-secondary">Enregistrer la location</Submit>
        </ActionForm>
      ) : null}
    </Section>
  );
}
