import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { saveInvoiceSettingsAction } from "@/app/actions";

export function InvoiceSettingsForm({
  initial,
  canEdit,
}: {
  initial: { invoice_prefix: string; credit_prefix: string; invoice_due_days: number; late_penalty_text: string; reminders_enabled: boolean; reminder_days: string; reminders_adaptive: boolean };
  canEdit: boolean;
}) {
  return (
    <div className="card p-5">
      <ActionForm action={saveInvoiceSettingsAction}>
        <fieldset disabled={!canEdit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor="inv-prefix">
                Préfixe des factures
              </label>
              <input id="inv-prefix" name="invoice_prefix" className="field" defaultValue={initial.invoice_prefix} maxLength={8} />
              <p className="mt-1 text-xs text-muted">Ex. : FA-2026-0001. La numérotation reste continue.</p>
            </div>
            <div>
              <label className="label" htmlFor="cr-prefix">
                Préfixe des avoirs
              </label>
              <input id="cr-prefix" name="credit_prefix" className="field" defaultValue={initial.credit_prefix} maxLength={8} />
            </div>
            <div>
              <label className="label" htmlFor="inv-due">
                Délai de paiement (jours)
              </label>
              <input id="inv-due" name="invoice_due_days" type="number" min={0} max={60} className="field" defaultValue={initial.invoice_due_days} />
              <p className="mt-1 text-xs text-muted">Pour les factures de solde. Les acomptes sont payables à réception.</p>
            </div>
          </div>
          <div>
            <label className="label" htmlFor="inv-pen">
              Mention des pénalités de retard
            </label>
            <textarea id="inv-pen" name="late_penalty_text" rows={2} className="field" defaultValue={initial.late_penalty_text} />
          </div>
          <div className="rounded-md bg-surface-2 p-4">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" name="reminders_enabled" defaultChecked={initial.reminders_enabled} /> Relancer automatiquement les factures impayées
            </label>
            <div className="mt-3 max-w-sm">
              <label className="label" htmlFor="inv-rem">
                Jours après l'échéance
              </label>
              <input id="inv-rem" name="reminder_days" className="field" defaultValue={initial.reminder_days} />
              <p className="mt-1 text-xs text-muted">Une relance par palier, avec la facture jointe. Ex. : 3, 15, 30.</p>
            </div>
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" name="reminders_adaptive" className="mt-0.5" defaultChecked={initial.reminders_adaptive} />
              <span>
                Adapter le rythme et le ton à chaque client
                <span className="block text-xs text-muted">
                  Un client qui paie à l'heure a quelques jours de plus ; un client souvent en retard ou un montant de plus de 5 000 € est relancé
                  plus tôt ; un montant de moins de 200 € reçoit une relance de moins. Le ton passe du simple rappel au dernier rappel avant
                  recouvrement.
                </span>
              </span>
            </label>
          </div>
          <div className="flex justify-end">
            <Submit>Enregistrer</Submit>
          </div>
        </fieldset>
      </ActionForm>
    </div>
  );
}
