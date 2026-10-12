"use client";

import { useActionState, useState } from "react";
import { Modal } from "@/components/Modal";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { formatEuros } from "@/lib/calc/format";
import { checkoutAction } from "@/app/actions";

export function Checkout({ plan, name, free, monthly, yearly }: { plan: string; name: string; free: boolean; monthly: number; yearly: number }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(checkoutAction, null);
  return (
    <>
      <button type="button" className="btn-secondary w-full" onClick={() => setOpen(true)}>
        {free ? "Passer à cette offre" : "Choisir"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Offre ${name}`}>
        {state?.ok ? (
          <div className="space-y-4">
            <FormMessage state={state} />
            <button type="button" className="btn-primary" onClick={() => setOpen(false)}>
              Fermer
            </button>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="plan" value={plan} />
            {free ? (
              <p className="text-sm">
                L'offre Découverte est gratuite et limitée. Vos devis existants restent consultables, mais certaines fonctions ne seront plus
                disponibles.
              </p>
            ) : (
              <>
                <fieldset className="grid grid-cols-2 gap-2">
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line p-3 text-sm has-checked:border-accent">
                    <input type="radio" name="interval" value="month" defaultChecked /> {formatEuros(monthly)} HT / mois
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line p-3 text-sm has-checked:border-accent">
                    <input type="radio" name="interval" value="year" /> {formatEuros(yearly)} HT / an
                  </label>
                </fieldset>
                <div>
                  <label className="label" htmlFor="card">
                    Numéro de carte (simulateur)
                  </label>
                  <input id="card" name="card" inputMode="numeric" className="field" defaultValue="4242 4242 4242 4242" required />
                  <p className="mt-1 text-xs text-muted">Aucun débit réel : environnement de démonstration.</p>
                </div>
              </>
            )}
            <FormMessage state={state} />
            <div className="flex justify-end">
              <Submit>{free ? "Confirmer" : "Payer et activer"}</Submit>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
