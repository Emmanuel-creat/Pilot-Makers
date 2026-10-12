"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/app/actions";
import { FormMessage, Submit } from "@/components/forms/Submit";

export function RegisterForm({ professions }: { professions: string[] }) {
  const [state, action] = useActionState(registerAction, null);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label htmlFor="name" className="label">
          Vos nom et prénom
        </label>
        <input id="name" name="name" autoComplete="name" required className="field" />
      </div>
      <div>
        <label htmlFor="company" className="label">
          Nom de votre entreprise
        </label>
        <input id="company" name="company" autoComplete="organization" required className="field" />
      </div>
      <div>
        <label htmlFor="trade" className="label">
          Métier principal
        </label>
        <select id="trade" name="trade" className="field" defaultValue="">
          <option value="">Choisir</option>
          {professions.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="email" className="label">
          Adresse e-mail professionnelle
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="field" />
      </div>
      <div>
        <label htmlFor="password" className="label">
          Mot de passe
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required className="field" />
        <p className="mt-1 text-xs text-muted">10 caractères minimum, avec des lettres et des chiffres.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="acceptTerms" required className="mt-1 h-4 w-4" />
        <span>
          J'accepte les{" "}
          <Link href="/cgu" className="link" target="_blank">
            conditions d'utilisation
          </Link>{" "}
          et j'ai pris connaissance de la{" "}
          <Link href="/confidentialite" className="link" target="_blank">
            politique de confidentialité
          </Link>
          .
        </span>
      </label>
      <FormMessage state={state} />
      <Submit className="btn-primary w-full" pendingLabel="Création...">
        Créer mon compte
      </Submit>
    </form>
  );
}
