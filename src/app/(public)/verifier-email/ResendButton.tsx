"use client";

import { useActionState } from "react";
import { resendVerificationAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";

export function ResendButton() {
  const [state, action] = useActionState(async () => resendVerificationAction(), null);
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <Submit className="btn-secondary w-full">Renvoyer le lien</Submit>
    </form>
  );
}
