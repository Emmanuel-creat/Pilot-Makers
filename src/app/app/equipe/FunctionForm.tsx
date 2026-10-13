"use client";

import { useActionState } from "react";
import { setFunctionAction } from "@/app/actions";

/** Fonction d'un membre (gérant, conducteur de travaux, secrétariat, ouvrier), enregistrée dès qu'elle change. */
export function FunctionForm({
  userId,
  name,
  value,
  options,
  ownerOnlyGerant,
}: {
  userId: string;
  name: string;
  value: string;
  options: [string, string][];
  ownerOnlyGerant: boolean;
}) {
  const [state, act, pending] = useActionState(setFunctionAction, null);
  return (
    <form action={act} className="mt-1 flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <select
        name="jobFunction"
        defaultValue={value}
        className="field min-h-8 py-0.5 text-xs"
        aria-label={`Fonction de ${name}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        disabled={pending}
      >
        <option value="">Fonction non précisée (droits du rôle)</option>
        {options
          .filter(([k]) => !ownerOnlyGerant || k === "gerant")
          .map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
      </select>
      {state?.error ? (
        <span className="text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : state?.ok ? (
        <span className="text-xs text-success" role="status">
          Enregistré
        </span>
      ) : null}
    </form>
  );
}
