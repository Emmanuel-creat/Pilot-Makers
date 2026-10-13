import { accountingPlanAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PLAN_FIELDS, VAT_RATES, type AccountingPlan } from "@/lib/services/accounting-plan";

const rate = (bp: number) => `${(bp / 100).toString().replace(".", ",")} %`;

/** Comptes repris dans le fichier des écritures comptables, à aligner sur le plan du cabinet. */
export function AccountingForm({ plan, canEdit }: { plan: AccountingPlan; canEdit: boolean }) {
  return (
    <ActionForm action={accountingPlanAction} className="card space-y-5 p-5">
      <p className="text-sm text-muted">
        Ces comptes sont utilisés dans le fichier des écritures comptables (FEC). Reprenez ceux de votre cabinet pour qu&apos;il importe vos ventes
        sans retouche.
      </p>
      <fieldset disabled={!canEdit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {PLAN_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="label" htmlFor={`acc-${f.key}`}>
                {f.label}
              </label>
              <input id={`acc-${f.key}`} name={f.key} className="field tabular" defaultValue={plan[f.key]} required maxLength={12} />
            </div>
          ))}
          <div>
            <label className="label" htmlFor="acc-aux">
              Préfixe des comptes clients auxiliaires
            </label>
            <input id="acc-aux" name="auxPrefix" className="field" defaultValue={plan.auxPrefix} maxLength={4} />
          </div>
        </div>
        <fieldset>
          <legend className="label">TVA collectée</legend>
          <div className="grid gap-4 sm:grid-cols-4">
            {VAT_RATES.map((bp) => (
              <div key={bp}>
                <label className="label" htmlFor={`acc-vat${bp}`}>
                  Taux {rate(bp)}
                </label>
                <input id={`acc-vat${bp}`} name={`vat${bp}`} className="field tabular" defaultValue={plan.vat[bp]} required maxLength={12} />
              </div>
            ))}
          </div>
        </fieldset>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="ventilate" className="mt-1 h-4 w-4" defaultChecked={plan.ventilate} />
          <span>
            Ventiler le chiffre d&apos;affaires par nature de ligne : main-d&apos;œuvre et forfaits, fournitures, sous-traitance, déplacements.
            <span className="block text-xs text-muted">Sinon, tout le hors taxe passe sur le compte des prestations de services.</span>
          </span>
        </label>
        <Submit>Enregistrer le plan comptable</Submit>
      </fieldset>
    </ActionForm>
  );
}
