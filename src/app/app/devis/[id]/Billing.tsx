"use client";

import { useActionState } from "react";
import { depositInvoiceAction, finalInvoiceAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";

/** Émission des factures d'un devis accepté : acomptes puis solde. */
export function QuoteBilling({ quoteId, defaultPercent, hasFinal }: { quoteId: string; defaultPercent: string; hasFinal: boolean }) {
  const [depState, depAction] = useActionState(depositInvoiceAction, null);
  const [finState, finAction] = useActionState(finalInvoiceAction, null);
  if (hasFinal) return null;
  return (
    <div className="space-y-3">
      <form action={depAction} className="flex items-end gap-2">
        <input type="hidden" name="quoteId" value={quoteId} />
        <div className="w-24">
          <label className="label" htmlFor="dep-pct">
            Acompte (%)
          </label>
          <input id="dep-pct" name="percent" inputMode="decimal" className="field" defaultValue={defaultPercent || "30"} required />
        </div>
        <Submit className="btn-secondary flex-1" pendingLabel="Émission...">
          Facturer l'acompte
        </Submit>
      </form>
      <FormMessage state={depState} />
      <form
        action={finAction}
        onSubmit={(e) => {
          if (!confirm("Émettre la facture de solde ? Elle sera numérotée et ne pourra plus être modifiée (seul un avoir pourra l'annuler).")) e.preventDefault();
        }}
      >
        <input type="hidden" name="quoteId" value={quoteId} />
        <Submit className="btn-primary w-full" pendingLabel="Émission...">
          Facturer le solde
        </Submit>
      </form>
      <FormMessage state={finState} />
    </div>
  );
}
