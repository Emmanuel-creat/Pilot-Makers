"use client";

import { monthlyReportAction, saveGoalsAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";

export function PrintButton() {
  return (
    <button type="button" className="btn-secondary print:hidden" onClick={() => window.print()}>
      <Icon name="download" size={16} /> Imprimer ou PDF
    </button>
  );
}

export function GoalsForm({ signed, sent }: { signed: string; sent: string }) {
  return (
    <ActionForm action={saveGoalsAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="g-signed">
            Montant signé visé par mois (€ HT)
          </label>
          <input id="g-signed" name="signed" className="field tabular" inputMode="decimal" defaultValue={signed} placeholder="Ex. : 25 000" />
        </div>
        <div>
          <label className="label" htmlFor="g-sent">
            Devis envoyés visés par mois
          </label>
          <input id="g-sent" name="sent" className="field tabular" inputMode="numeric" defaultValue={sent} placeholder="Ex. : 20" />
        </div>
      </div>
      <Submit>Enregistrer les objectifs</Submit>
    </ActionForm>
  );
}

export function MonthlyReportForm({ enabled }: { enabled: boolean }) {
  return (
    <ActionForm action={monthlyReportAction} className="space-y-3">
      <label className="flex min-h-6 items-center gap-2 text-sm">
        <input type="checkbox" name="enabled" defaultChecked={enabled} /> Recevoir chaque début de mois le rapport du mois écoulé par e-mail
      </label>
      <Submit>Enregistrer</Submit>
    </ActionForm>
  );
}
