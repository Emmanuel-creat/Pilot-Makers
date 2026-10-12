"use client";

import { useActionState } from "react";
import { installLibraryAction } from "@/app/actions";

export function InstallButton({ trade }: { trade: string }) {
  const [state, action, pending] = useActionState(installLibraryAction, null);
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="trade" value={trade} />
      <button className="btn-secondary" disabled={pending}>
        {pending ? "Ajout..." : "Ajouter à mon catalogue"}
      </button>
      {state?.message ? <span className="text-sm text-success">{state.message}</span> : null}
      {state?.error ? <span className="text-sm text-danger">{state.error}</span> : null}
    </form>
  );
}
