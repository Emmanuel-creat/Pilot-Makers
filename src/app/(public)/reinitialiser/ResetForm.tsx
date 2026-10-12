"use client";

import { useActionState } from "react";
import { resetAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="password" className="label">
          Nouveau mot de passe
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </div>
      <div>
        <label htmlFor="confirm" className="label">
          Confirmation
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required className="field" />
      </div>
      <FormMessage state={state} />
      <Submit className="btn-primary w-full">Enregistrer</Submit>
    </form>
  );
}
