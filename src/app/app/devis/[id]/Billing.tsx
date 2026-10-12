"use client";

import { useActionState } from "react";
import { depositInvoiceAction, progressInvoiceAction, finalInvoiceAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";

/** Émission des factures d'un devis accepté : acomptes puis solde. */
export function QuoteBilling({
  quoteId,
  defaultPercent,
  hasFinal,
  hasDeposits = false,
  progress = { count: 0, cumulativeBp: 0 },
}: {
  quoteId: string;
  defaultPercent: string;
  hasFinal: boolean;
  hasDeposits?: boolean;
  /** Situations déjà facturées et avancement cumulé (points de base) */
  progress?: { count: number; cumulativeBp: number };
}) {
  const [depState, depAction] = useActionState(depositInvoiceAction, null);
  const [proState, proAction] = useActionState(progressInvoiceAction, null);
  const done = (progress.cumulativeBp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  const [finState, finAction] = useActionState(finalInvoiceAction, null);
  if (hasFinal) return null;
  return (
    <div className="space-y-3">
      {progress.count ? (
        <p className="text-xs text-muted">
          {progress.count} situation{progress.count > 1 ? "s" : ""} facturée{progress.count > 1 ? "s" : ""}, avancement cumulé {done} %.
        </p>
      ) : null}
      {!hasDeposits ? (
        <>
          <form action={proAction} className="flex items-end gap-2">
            <input type="hidden" name="quoteId" value={quoteId} />
            <div className="w-28">
              <label className="label" htmlFor="pro-pct">
                Avancement (%)
              </label>
              <input id="pro-pct" name="percent" inputMode="decimal" className="field" placeholder={progress.count ? `> ${done}` : "40"} required />
            </div>
            <Submit className="btn-secondary flex-1" pendingLabel="Émission...">
              Facturer une situation
            </Submit>
          </form>
          <FormMessage state={proState} />
        </>
      ) : null}
      {progress.count ? null : (
        <>
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
        </>
      )}
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
