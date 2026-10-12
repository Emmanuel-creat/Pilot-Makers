"use client";

import { useActionState } from "react";
import { acceptInviteAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";

export function AcceptInvite({ token, email }: { token: string; email: string }) {
  const [state, action] = useActionState(async () => acceptInviteAction(token), null);
  return (
    <form action={action} className="space-y-3 text-sm">
      <p>
        Vous êtes connecté avec <strong>{email}</strong>.
      </p>
      <FormMessage state={state} />
      <Submit className="btn-primary w-full">Accepter l'invitation</Submit>
    </form>
  );
}
