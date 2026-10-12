"use client";

import { useActionState, useState } from "react";
import { creditNoteAction, paymentAction, sendInvoiceAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";

export function PaymentForm({ invoiceId, balance, today, methods }: { invoiceId: string; balance: string; today: string; methods: [string, string][] }) {
  const [state, action] = useActionState(paymentAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label" htmlFor="pay-amount">
            Montant (€)
          </label>
          <input id="pay-amount" name="amount" inputMode="decimal" className="field" defaultValue={balance} required key={balance} />
        </div>
        <div>
          <label className="label" htmlFor="pay-date">
            Reçu le
          </label>
          <input id="pay-date" name="paidOn" type="date" max={today} className="field" defaultValue={today} required />
        </div>
        <div>
          <label className="label" htmlFor="pay-method">
            Moyen
          </label>
          <select id="pay-method" name="method" className="field" defaultValue="virement">
            {methods.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="pay-ref">
            Référence
          </label>
          <input id="pay-ref" name="reference" className="field" placeholder="N° de chèque..." />
        </div>
      </div>
      <FormMessage state={state} />
      <Submit className="btn-primary w-full">Enregistrer le paiement</Submit>
    </form>
  );
}

export function CreditNoteForm({ invoiceId, canFull, vatOptions }: { invoiceId: string; canFull: boolean; vatOptions: string[] }) {
  const [state, action] = useActionState(creditNoteAction, null);
  const [mode, setMode] = useState(canFull ? "full" : "partial");
  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(e) => {
        if (!confirm("Émettre cet avoir ? Il sera numéroté et ne pourra plus être modifié.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <fieldset className="flex gap-4 text-sm">
        <legend className="sr-only">Type d'avoir</legend>
        {canFull ? (
          <label className="flex items-center gap-2">
            <input type="radio" name="mode" value="full" checked={mode === "full"} onChange={() => setMode("full")} /> Total
          </label>
        ) : null}
        <label className="flex items-center gap-2">
          <input type="radio" name="mode" value="partial" checked={mode === "partial"} onChange={() => setMode("partial")} /> Partiel
        </label>
      </fieldset>
      {mode === "full" ? (
        <div>
          <label className="label" htmlFor="cn-reason">
            Motif
          </label>
          <input id="cn-reason" name="reason" className="field" placeholder="Ex. : erreur de facturation" />
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_96px] gap-2">
          <div className="col-span-2">
            <label className="label" htmlFor="cn-label">
              Motif
            </label>
            <input id="cn-label" name="label" className="field" placeholder="Ex. : geste commercial, prestation non réalisée" required />
          </div>
          <div>
            <label className="label" htmlFor="cn-ht">
              Montant HT (€)
            </label>
            <input id="cn-ht" name="amountHt" inputMode="decimal" className="field" required />
          </div>
          <div>
            <label className="label" htmlFor="cn-vat">
              TVA (%)
            </label>
            <select id="cn-vat" name="vatPercent" className="field">
              {vatOptions.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <FormMessage state={state} />
      <Submit className="btn-secondary w-full">Émettre l'avoir</Submit>
    </form>
  );
}

export function SendInvoiceForm({ invoiceId, to, subject, body }: { invoiceId: string; to: string; subject: string; body: string }) {
  const [state, action] = useActionState(sendInvoiceAction, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <div>
        <label className="label" htmlFor="si-to">
          Destinataire
        </label>
        <input id="si-to" name="to" type="email" className="field" defaultValue={to} required />
      </div>
      <div>
        <label className="label" htmlFor="si-subject">
          Objet
        </label>
        <input id="si-subject" name="subject" className="field" defaultValue={subject} required />
      </div>
      <div>
        <label className="label" htmlFor="si-body">
          Message
        </label>
        <textarea id="si-body" name="body" rows={6} className="field" defaultValue={body} required />
      </div>
      <p className="text-xs text-muted">Le PDF figé est joint au message.</p>
      <FormMessage state={state} />
      <Submit className="btn-primary w-full">Envoyer</Submit>
    </form>
  );
}
