import { financingSaveAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { EQUIPMENT_CATEGORIES, FINANCING_KINDS } from "@/lib/financing";
import type { FinancingRequest } from "@/lib/services/financing";

const euros = (c: number) => (c ? (c / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2, useGrouping: false }) : "");
const rate = (bp: number) => (bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });

/** Saisie ou modification d'une demande de financement. */
export function FinancingForm({ f }: { f?: FinancingRequest }) {
  return (
    <ActionForm action={financingSaveAction} className="space-y-3">
      {f ? <input type="hidden" name="id" value={f.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="fi-label">
            Équipement
          </label>
          <input id="fi-label" name="label" className="field" defaultValue={f?.label} placeholder="Ex. fourgon 3,5 t, mini-pelle, échafaudage" required />
        </div>
        <div>
          <label className="label" htmlFor="fi-category">
            Catégorie
          </label>
          <select id="fi-category" name="category" className="field" defaultValue={f?.category ?? "vehicule"}>
            {Object.entries(EQUIPMENT_CATEGORIES).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fi-supplier">
            Fournisseur
          </label>
          <input id="fi-supplier" name="supplier" className="field" defaultValue={f?.supplier} />
        </div>
        <div>
          <label className="label" htmlFor="fi-amount">
            Montant HT (€)
          </label>
          <input id="fi-amount" name="amount" inputMode="decimal" className="field" defaultValue={euros(f?.amountCents ?? 0)} required />
        </div>
        <div>
          <label className="label" htmlFor="fi-down">
            Apport (€)
          </label>
          <input id="fi-down" name="down" inputMode="decimal" className="field" defaultValue={euros(f?.downCents ?? 0)} />
        </div>
        <div>
          <label className="label" htmlFor="fi-kind">
            Formule
          </label>
          <select id="fi-kind" name="kind" className="field" defaultValue={f?.kind ?? "credit_bail"}>
            {Object.entries(FINANCING_KINDS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fi-months">
            Durée (mois)
          </label>
          <input id="fi-months" name="months" inputMode="numeric" className="field" defaultValue={f?.months ?? 48} required />
        </div>
        <div>
          <label className="label" htmlFor="fi-rate">
            Taux annuel (%)
          </label>
          <input
            id="fi-rate"
            name="rate"
            inputMode="decimal"
            className="field"
            defaultValue={f ? rate(f.rateBp) : ""}
            placeholder="Taux indicatif selon la formule"
          />
        </div>
        <div>
          <label className="label" htmlFor="fi-residual">
            Valeur résiduelle (% du montant)
          </label>
          <input id="fi-residual" name="residual" inputMode="decimal" className="field" defaultValue={f?.residualBp ? rate(f.residualBp) : ""} />
        </div>
        <div>
          <label className="label" htmlFor="fi-quote">
            Référence du devis fournisseur
          </label>
          <input id="fi-quote" name="quoteRef" className="field" defaultValue={f?.quoteRef} />
        </div>
        <div>
          <label className="label" htmlFor="fi-lender">
            Banque ou loueur
          </label>
          <input id="fi-lender" name="lender" className="field" defaultValue={f?.lender} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="fi-purpose">
            Usage prévu
          </label>
          <textarea id="fi-purpose" name="purpose" rows={2} className="field" defaultValue={f?.purpose} />
        </div>
      </div>
      <Submit className="btn-primary">{f ? "Enregistrer" : "Créer la demande"}</Submit>
    </ActionForm>
  );
}
