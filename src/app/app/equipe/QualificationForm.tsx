"use client";

import { useActionState } from "react";
import { setQualificationAction } from "@/app/actions";

/** Qualification d'un membre, enregistrée dès qu'elle change. */
export function QualificationForm({ userId, name, value, options }: { userId: string; name: string; value: string; options: string[] }) {
  const [state, act, pending] = useActionState(setQualificationAction, null);
  return (
    <form action={act} className="mt-1 flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <select
        name="qualification"
        defaultValue={value}
        className="field min-h-8 py-0.5 text-xs"
        aria-label={`Qualification de ${name}`}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        disabled={pending}
      >
        <option value="">Qualification non renseignée</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {state?.error ? (
        <span className="text-xs text-danger" role="alert">
          {state.error}
        </span>
      ) : state?.ok ? (
        <span className="text-xs text-success">Enregistré</span>
      ) : null}
    </form>
  );
}
