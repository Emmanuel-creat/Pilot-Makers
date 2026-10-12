"use client";

import Link from "next/link";
import { useActionState } from "react";
import { loginAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";

export function LoginForm({ next }: { next: string }) {
  const [state, action] = useActionState(loginAction, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor="email" className="label">
          Adresse e-mail
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="label">
            Mot de passe
          </label>
          <Link href="/mot-de-passe-oublie" className="link mb-1 text-sm">
            Mot de passe oublié
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
      </div>
      <FormMessage state={state} />
      <Submit className="btn-primary w-full" pendingLabel="Connexion...">
        Se connecter
      </Submit>
    </form>
  );
}
