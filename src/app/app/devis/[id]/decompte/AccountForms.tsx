"use client";

import { saveFinalAccountPenaltiesAction, setFinalAccountStatusAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";

export function PenaltiesForm({ quoteId, amount, note }: { quoteId: string; amount: string; note: string }) {
  return (
    <ActionForm action={saveFinalAccountPenaltiesAction} className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
      <input type="hidden" name="quoteId" value={quoteId} />
      <div>
        <label className="label" htmlFor="fa-amount">
          Pénalités (€)
        </label>
        <input id="fa-amount" name="amount" className="field tabular" inputMode="decimal" defaultValue={amount} placeholder="0" />
      </div>
      <div>
        <label className="label" htmlFor="fa-note">
          Motif
        </label>
        <input id="fa-note" name="note" className="field" maxLength={300} defaultValue={note} placeholder="Ex. : retard de livraison de 3 jours" />
      </div>
      <Submit className="btn-secondary">Enregistrer les pénalités</Submit>
    </ActionForm>
  );
}

export function StatusButton({ quoteId, status, label, primary }: { quoteId: string; status: string; label: string; primary?: boolean }) {
  return (
    <ActionForm action={setFinalAccountStatusAction} className="inline">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="status" value={status} />
      <Submit className={primary ? "btn-primary" : "btn-secondary"}>{label}</Submit>
    </ActionForm>
  );
}

export function ContestForm({ quoteId }: { quoteId: string }) {
  return (
    <ActionForm action={setFinalAccountStatusAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="quoteId" value={quoteId} />
      <input type="hidden" name="status" value="conteste" />
      <div className="min-w-0 flex-1">
        <label className="label" htmlFor="fa-contest">
          Motif de la contestation
        </label>
        <input id="fa-contest" name="note" className="field" maxLength={500} required />
      </div>
      <Submit className="btn-secondary">Noter la contestation</Submit>
    </ActionForm>
  );
}
