import { addWasteAction, deleteWasteAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { categoryByKey, entryIssues, WASTE_CATEGORIES, WASTE_CLASSES, WASTE_UNITS, wasteSummary, type WasteEntry } from "@/lib/waste";

const qty = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });

/** Évacuations de déchets du chantier, avec leur bordereau, et bilan par nature de déchet. */
export function WasteSection({ jobId, entries, canEdit, today }: { jobId: string; entries: WasteEntry[]; canEdit: boolean; today: string }) {
  const sum = wasteSummary(entries);
  return (
    <Section
      title="Déchets du chantier"
      description="Notez chaque évacuation avec son bon de dépôt ou son bordereau : elles alimentent le registre des déchets de l'entreprise."
    >
      {entries.length ? (
        <div className="space-y-3">
          <p className="text-sm" data-testid="bilan-dechets">
            {sum.byClass
              .map((c) => `${c.label} : ${[c.tonnes ? `${qty(c.tonnes)} t` : "", c.volumeM3 ? `${qty(c.volumeM3)} m³` : ""].filter(Boolean).join(" et ")}`)
              .join(" ; ")}
            {sum.sortedShare !== null ? `. Tri à la source : ${sum.sortedShare} % des évacuations` : ""}
            {sum.costCents ? `. Coût : ${formatEuros(sum.costCents)}` : ""}.
          </p>
          <ul className="divide-y divide-line text-sm">
            {entries.map((e) => {
              const c = categoryByKey(e.category);
              const issues = entryIssues(e);
              return (
                <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c?.label ?? e.category}, {qty(e.quantity)} {WASTE_UNITS[e.unit]}
                    </p>
                    <p className="text-xs text-muted">
                      {[
                        fmtDate(e.date),
                        c ? WASTE_CLASSES[c.cls] : "",
                        e.destination,
                        e.slipRef ? `bordereau ${e.slipRef}` : "",
                        e.costCents ? formatEuros(e.costCents) : "",
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    {issues.length ? (
                      <p className="flex items-center gap-1 text-xs text-warning">
                        <Icon name="alert" size={14} /> {issues.join(" ; ")}
                      </p>
                    ) : null}
                  </div>
                  {canEdit ? (
                    <form action={deleteWasteAction}>
                      <input type="hidden" name="id" value={e.id} />
                      <button
                        type="submit"
                        className="inline-flex min-h-6 min-w-6 items-center justify-center text-xs text-muted hover:text-danger"
                        aria-label={`Supprimer l'évacuation du ${fmtDate(e.date)}`}
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted">Aucune évacuation notée.</p>
      )}
      {canEdit ? (
        <ActionForm action={addWasteAction} resetOnSuccess className="mt-4 space-y-3 border-t border-line pt-4">
          <input type="hidden" name="jobId" value={jobId} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="w-cat">
                Nature du déchet
              </label>
              <select id="w-cat" name="category" className="field" defaultValue="gravats">
                {(Object.keys(WASTE_CLASSES) as (keyof typeof WASTE_CLASSES)[]).map((cls) => (
                  <optgroup key={cls} label={WASTE_CLASSES[cls]}>
                    {WASTE_CATEGORIES.filter((c) => c.cls === cls).map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="w-date">
                Date d'évacuation
              </label>
              <input id="w-date" name="date" type="date" className="field" defaultValue={today} max={today} required />
            </div>
            <div>
              <label className="label" htmlFor="w-qty">
                Quantité
              </label>
              <input id="w-qty" name="quantity" inputMode="decimal" className="field" required />
            </div>
            <div>
              <label className="label" htmlFor="w-unit">
                Unité
              </label>
              <select id="w-unit" name="unit" className="field" defaultValue="t">
                {Object.entries(WASTE_UNITS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="w-cost">
                Coût HT (€)
              </label>
              <input id="w-cost" name="cost" inputMode="decimal" className="field" />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="w-dest">
                Installation de destination
              </label>
              <input id="w-dest" name="destination" className="field" maxLength={200} placeholder="Ex. : déchèterie professionnelle de Vénissieux" />
            </div>
            <div>
              <label className="label" htmlFor="w-slip">
                N° de bordereau ou de bon
              </label>
              <input id="w-slip" name="slipRef" className="field" maxLength={60} />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="w-carrier">
                Transporteur
              </label>
              <input id="w-carrier" name="carrier" className="field" maxLength={200} placeholder="Laissez vide si vous transportez vous-même" />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="sorted" className="h-4 w-4" defaultChecked /> Trié à la source
            </label>
          </div>
          <p className="text-xs text-muted">Déchets dangereux : bordereau BSDD sur Trackdéchets ; amiante : bordereau BSDA obligatoire.</p>
          <Submit className="btn-secondary">Noter l'évacuation</Submit>
        </ActionForm>
      ) : null}
    </Section>
  );
}
