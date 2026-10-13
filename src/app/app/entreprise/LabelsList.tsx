import { addLabelAction, labelAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { LABEL_KINDS, labelState, labelTitle, type OrgLabel } from "@/lib/labels";

const fr = (iso: string) => iso.split("-").reverse().join("/");
const STATE: Record<string, string> = { a_renouveler: "text-warning", expire: "text-danger" };

/** Labels de l'entreprise, montrés aux clients sur la vitrine et les devis consultés en ligne. */
export function LabelsList({ items, canEdit, today, rgeCount }: { items: OrgLabel[]; canEdit: boolean; today: string; rgeCount: number }) {
  return (
    <section className="card mt-6 space-y-4 p-5" aria-labelledby="labels-title">
      <div>
        <h2 id="labels-title" className="flex items-center gap-2 font-semibold">
          <Icon name="star" size={18} /> Labels et qualifications
        </h2>
        <p className="mt-1 text-sm text-muted">
          Montrés à vos clients sur votre vitrine et sur les devis qu&apos;ils consultent en ligne, tant qu&apos;ils sont valables
          {rgeCount ? `, avec vos ${rgeCount > 1 ? `${rgeCount} qualifications` : "qualification"} RGE` : ""}.
        </p>
      </div>
      {items.length ? (
        <ul className="divide-y divide-line text-sm" data-testid="liste-labels">
          {items.map((l) => {
            const state = labelState(l.validUntil, today);
            return (
              <li key={l.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">
                    {labelTitle(l)}
                    {l.number ? `, n° ${l.number}` : ""}
                  </div>
                  <div className={STATE[state] ?? "text-muted"}>
                    {state === "permanent"
                      ? "Sans date de fin"
                      : state === "expire"
                        ? `Expiré depuis le ${fr(l.validUntil!)}, plus montré aux clients`
                        : `Valable jusqu'au ${fr(l.validUntil!)}${state === "a_renouveler" ? ", à renouveler" : ""}`}
                  </div>
                  {!l.shown ? <div className="text-muted">Masqué aux clients</div> : null}
                </div>
                {canEdit ? (
                  <div className="flex gap-3">
                    <form action={labelAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="op" value={l.shown ? "hide" : "show"} />
                      <button className="link">{l.shown ? "Masquer" : "Montrer"}</button>
                    </form>
                    <form action={labelAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="op" value="delete" />
                      <button className="link text-danger" aria-label={`Supprimer ${labelTitle(l)}`}>
                        Supprimer
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucun label enregistré.</p>
      )}
      {canEdit ? (
        <ActionForm action={addLabelAction} className="space-y-3 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="label-kind">
                Label
              </label>
              <select id="label-kind" name="kind" className="field" defaultValue="qualibat">
                {Object.entries(LABEL_KINDS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="label-name">
                Précision ou nom du label
              </label>
              <input id="label-name" name="name" className="field" maxLength={80} placeholder="Ex. : 2111, ou nom d'un autre label" />
            </div>
            <div>
              <label className="label" htmlFor="label-number">
                Numéro (facultatif)
              </label>
              <input id="label-number" name="number" className="field" maxLength={60} />
            </div>
            <div>
              <label className="label" htmlFor="label-until">
                Date de fin (facultatif)
              </label>
              <input id="label-until" name="validUntil" type="date" className="field" />
            </div>
          </div>
          <Submit>Ajouter le label</Submit>
        </ActionForm>
      ) : null}
    </section>
  );
}
