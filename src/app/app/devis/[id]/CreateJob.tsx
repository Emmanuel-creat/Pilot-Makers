"use client";

import { useActionState } from "react";
import { createJobAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";

export function CreateJob({ quoteId }: { quoteId: string }) {
  const [state, run] = useActionState(createJobAction, null);
  return (
    <form action={run}>
      <input type="hidden" name="quoteId" value={quoteId} />
      <Submit className="btn-secondary w-full" pendingLabel="Création...">
        <Icon name="hammer" size={16} /> Créer le chantier
      </Submit>
      <FormMessage state={state} />
    </form>
  );
}
