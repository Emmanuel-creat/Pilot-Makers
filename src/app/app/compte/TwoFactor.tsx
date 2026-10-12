"use client";

import { useActionState, type ReactNode } from "react";
import type { ActionState } from "@/app/actions";
import { FormMessage } from "@/components/forms/Submit";

/** Formulaire qui affiche, une seule fois, les codes de secours renvoyés par l'action. */
export function CodesForm({ action, children }: { action: (s: ActionState, fd: FormData) => Promise<ActionState>; children: ReactNode }) {
  const [state, run] = useActionState(action, null);
  if (state?.codes) {
    return (
      <div className="space-y-3">
        <FormMessage state={{ ok: true, message: state.message }} />
        <p className="text-sm">
          Conservez ces codes de secours en lieu sûr (papier, gestionnaire de mots de passe). Chacun permet une connexion si vous perdez votre
          téléphone. Ils ne seront plus affichés.
        </p>
        <ul className="grid grid-cols-2 gap-2 rounded-md border border-line bg-surface-2 p-3 font-mono text-sm sm:grid-cols-5" aria-label="Codes de secours">
          {state.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => navigator.clipboard?.writeText(state.codes!.join("\n"))}>
            Copier les codes
          </button>
          <a className="btn-secondary" href="/app/compte">
            J'ai noté mes codes
          </a>
        </div>
      </div>
    );
  }
  return (
    <form action={run} className="space-y-3">
      {children}
      <FormMessage state={state} />
    </form>
  );
}
