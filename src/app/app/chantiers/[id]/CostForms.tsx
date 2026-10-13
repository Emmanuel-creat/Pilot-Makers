"use client";

import { addPurchaseAction, budgetThresholdAction, deletePurchaseAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";

/** Achat affecté au chantier : facture fournisseur, sous-traitance, location. */
export function PurchaseForm({
  jobId,
  tasks,
  categories,
  today,
}: {
  jobId: string;
  tasks: { id: string; label: string }[];
  categories: Record<string, string>;
  today: string;
}) {
  return (
    <ActionForm action={addPurchaseAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="jobId" value={jobId} />
      <div className="sm:col-span-2">
        <label className="label" htmlFor="pu-label">
          Achat
        </label>
        <input id="pu-label" name="label" className="field" maxLength={200} placeholder="Carrelage 60x60, location de nacelle..." required />
      </div>
      <div>
        <label className="label" htmlFor="pu-amount">
          Montant HT (euros)
        </label>
        <input id="pu-amount" name="amount" className="field" inputMode="decimal" placeholder="395,50" required aria-describedby="pu-amount-help" />
        <p id="pu-amount-help" className="mt-1 text-xs text-muted">
          Montant négatif pour un avoir fournisseur
        </p>
      </div>
      <div>
        <label className="label" htmlFor="pu-date">
          Date
        </label>
        <input id="pu-date" name="date" type="date" className="field" defaultValue={today} required />
      </div>
      <div>
        <label className="label" htmlFor="pu-category">
          Nature
        </label>
        <select id="pu-category" name="category" className="field">
          {Object.entries(categories).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pu-supplier">
          Fournisseur
        </label>
        <input id="pu-supplier" name="supplier" className="field" maxLength={120} />
      </div>
      <div>
        <label className="label" htmlFor="pu-task">
          Ligne du devis
        </label>
        <select id="pu-task" name="taskId" className="field">
          <option value="">Chantier en général</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="pu-ref">
          Référence de la facture
        </label>
        <input id="pu-ref" name="reference" className="field" maxLength={80} />
      </div>
      <div className="sm:col-span-2">
        <Submit className="btn-secondary" pendingLabel="Enregistrement...">
          <Icon name="plus" size={16} /> Ajouter l'achat
        </Submit>
      </div>
    </ActionForm>
  );
}

export function DeletePurchase({ id, label }: { id: string; label: string }) {
  return (
    <ActionForm action={deletePurchaseAction} className="">
      <input type="hidden" name="id" value={id} />
      <button className="btn-ghost min-h-8 px-2 text-danger" aria-label={`Supprimer l'achat ${label}`}>
        <Icon name="trash" size={16} />
      </button>
    </ActionForm>
  );
}

export function ThresholdForm({ jobId, percent }: { jobId: string; percent: number }) {
  return (
    <ActionForm action={budgetThresholdAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="jobId" value={jobId} />
      <div>
        <label className="label" htmlFor="budget-threshold">
          Alerter à partir de (% du coût prévu)
        </label>
        <input id="budget-threshold" name="percent" type="number" min={50} max={150} step={1} defaultValue={percent} className="field w-28" />
      </div>
      <Submit className="btn-secondary" pendingLabel="...">
        Enregistrer
      </Submit>
    </ActionForm>
  );
}
