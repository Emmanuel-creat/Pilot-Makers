import Link from "next/link";
import { AuthCard } from "@/components/forms/AuthCard";
import { getCtx } from "@/lib/server/session";
import { AcceptInvite } from "./AcceptInvite";

export default async function Page({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton = "" } = await searchParams;
  const ctx = await getCtx();
  return (
    <AuthCard title="Invitation" subtitle="Rejoignez l'espace de votre entreprise sur Pilot-Makers.">
      {ctx ? (
        <AcceptInvite token={jeton} email={ctx.email} />
      ) : (
        <div className="space-y-3 text-sm">
          <p>Connectez-vous ou créez un compte avec l'adresse qui a reçu l'invitation, puis rouvrez ce lien.</p>
          <div className="flex gap-2">
            <Link className="btn-primary" href={`/connexion?next=${encodeURIComponent("/invitation?jeton=" + jeton)}`}>
              Se connecter
            </Link>
            <Link className="btn-secondary" href="/inscription">
              Créer un compte
            </Link>
          </div>
        </div>
      )}
    </AuthCard>
  );
}
