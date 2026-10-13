import { addRgeAction, removeRgeAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { RGE_BODIES, RGE_DOMAINS, type RgeQualification } from "@/lib/services/aids";

const fr = (iso: string) => iso.split("-").reverse().join("/");

/** Qualifications RGE : condition des aides à la rénovation, contrôlées à l'émission des devis qui les visent. */
export function RgeList({ items, canEdit, today }: { items: RgeQualification[]; canEdit: boolean; today: string }) {
  return (
    <section className="card mt-6 space-y-4 p-5" aria-labelledby="rge-title">
      <div>
        <h2 id="rge-title" className="flex items-center gap-2 font-semibold">
          <Icon name="shield" size={18} /> Qualifications RGE
        </h2>
        <p className="mt-1 text-sm text-muted">
          Indispensables pour que vos clients obtiennent MaPrimeRénov&apos;, les primes CEE ou l&apos;éco-prêt à taux zéro. Un devis qui vise ces
          aides ne peut être émis que si une qualification valide couvre chaque domaine de travaux.
        </p>
      </div>
      {items.length ? (
        <ul className="divide-y divide-line text-sm" data-testid="liste-rge">
          {items.map((q) => (
            <li key={q.id} className="flex flex-wrap items-start justify-between gap-2 py-2">
              <div>
                <div className="font-medium">
                  {q.body}, n° {q.number}
                </div>
                <div className="text-muted">{q.domains.map((d) => RGE_DOMAINS[d]).join(", ")}</div>
                <div className={q.valid_until < today ? "text-danger" : "text-muted"}>
                  {q.valid_until < today ? "Expirée depuis le" : "Valable jusqu'au"} {fr(q.valid_until)}
                </div>
              </div>
              {canEdit ? (
                <form action={removeRgeAction}>
                  <input type="hidden" name="id" value={q.id} />
                  <button className="link text-danger">Supprimer</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">Aucune qualification enregistrée.</p>
      )}
      {canEdit ? (
        <ActionForm action={addRgeAction} className="space-y-3 border-t border-line pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="rge-body">
                Organisme
              </label>
              <select id="rge-body" name="body" className="field" defaultValue="Qualibat">
                {RGE_BODIES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="rge-number">
                Numéro de qualification
              </label>
              <input id="rge-number" name="number" className="field" required maxLength={60} />
            </div>
            <div>
              <label className="label" htmlFor="rge-until">
                Valable jusqu&apos;au
              </label>
              <input id="rge-until" name="valid_until" type="date" className="field" required />
            </div>
          </div>
          <fieldset>
            <legend className="label">Domaines couverts</legend>
            <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {Object.entries(RGE_DOMAINS).map(([k, label]) => (
                <label key={k} className="flex min-h-6 items-center gap-2 text-sm">
                  <input type="checkbox" name="domains" value={k} /> {label}
                </label>
              ))}
            </div>
          </fieldset>
          <Submit>Ajouter la qualification</Submit>
        </ActionForm>
      ) : null}
    </section>
  );
}
