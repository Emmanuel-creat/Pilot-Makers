import Link from "next/link";
import { AuthCard } from "@/components/forms/AuthCard";
import { Notice } from "@/components/ui";
import { LoginForm } from "./LoginForm";
import { PasskeyLogin } from "@/components/Passkeys";

export const metadata = { title: "Connexion" };

export default async function Page({ searchParams }: { searchParams: Promise<{ reinitialise?: string; next?: string; sso?: string }> }) {
  const sp = await searchParams;
  return (
    <AuthCard
      title="Connexion"
      subtitle="Accédez à vos devis et à vos clients."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link href="/inscription" className="link">
            Créer un compte
          </Link>
        </>
      }
    >
      {sp.sso ? (
        <div className="mb-4">
          <Notice tone="warning" title="Connexion d'entreprise">
            {sp.sso.slice(0, 200)}
          </Notice>
        </div>
      ) : null}
      {sp.reinitialise ? (
        <div className="mb-4">
          <Notice tone="success">Mot de passe modifié. Connectez-vous avec le nouveau.</Notice>
        </div>
      ) : null}
      <LoginForm next={sp.next ?? ""} />
      <div className="mt-4">
        <PasskeyLogin next={sp.next ?? ""} />
      </div>
      <details className="mt-4 text-sm" data-testid="connexion-entreprise">
        <summary className="cursor-pointer font-medium">Connexion d&apos;entreprise</summary>
        <form action="/api/auth/sso/depart" method="get" className="mt-3 space-y-3">
          <input type="hidden" name="next" value={sp.next ?? ""} />
          <div>
            <label className="label" htmlFor="sso-email">
              Adresse e-mail professionnelle
            </label>
            <input id="sso-email" name="email" type="email" required autoComplete="email" className="field" />
          </div>
          <button className="btn-secondary w-full">Continuer avec l&apos;annuaire de l&apos;entreprise</button>
        </form>
      </details>
    </AuthCard>
  );
}
