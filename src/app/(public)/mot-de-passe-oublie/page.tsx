"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotAction } from "@/app/actions";
import { AuthCard } from "@/components/forms/AuthCard";
import { FormMessage, Submit } from "@/components/forms/Submit";

export default function Page() {
  const [state, action] = useActionState(forgotAction, null);
  return (
    <AuthCard
      title="Mot de passe oublié"
      subtitle="Recevez un lien pour choisir un nouveau mot de passe."
      footer={
        <Link href="/connexion" className="link">
          Retour à la connexion
        </Link>
      }
    >
      <form action={action} className="space-y-4">
        <div>
          <label htmlFor="email" className="label">
            Adresse e-mail
          </label>
          <input id="email" name="email" type="email" required className="field" />
        </div>
        <FormMessage state={state} />
        <Submit className="btn-primary w-full">Envoyer le lien</Submit>
      </form>
    </AuthCard>
  );
}
