"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { verifyLoginAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";

export function VerifyForm({ next }: { next: string }) {
  const [state, action] = useActionState(verifyLoginAction, null);
  const [recovery, setRecovery] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="code" className="label">
          {recovery ? "Code de secours" : "Code de vérification"}
        </label>
        {recovery ? (
          <input id="code" name="code" autoComplete="off" required className="field font-mono" placeholder="abcde-fghij" key="r" />
        ) : (
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            required
            autoFocus
            className="field text-center font-mono text-lg tracking-widest"
            key="t"
          />
        )}
      </div>
      <FormMessage state={state} />
      <Submit className="btn-primary w-full" pendingLabel="Vérification...">
        Valider
      </Submit>
      <div className="flex justify-between text-sm">
        <button type="button" className="link" onClick={() => setRecovery((r) => !r)}>
          {recovery ? "Utiliser l'application" : "Utiliser un code de secours"}
        </button>
        <Link href="/connexion" className="link">
          Recommencer
        </Link>
      </div>
    </form>
  );
}
