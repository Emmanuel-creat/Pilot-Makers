import Link from "next/link";
import { AuthCard } from "@/components/forms/AuthCard";
import { Notice } from "@/components/ui";
import { getCtx } from "@/lib/server/session";
import { getDb } from "@/lib/db";
import { verifyEmailAction } from "@/app/actions";
import { ResendButton } from "./ResendButton";

export const metadata = { title: "Vérification de l'e-mail" };

export default async function Page({ searchParams }: { searchParams: Promise<{ jeton?: string }> }) {
  const { jeton } = await searchParams;
  if (jeton) {
    const r = await verifyEmailAction(jeton);
    return (
      <AuthCard title={r?.ok ? "Adresse confirmée" : "Lien invalide"}>
        {r?.ok ? (
          <div className="space-y-4">
            <Notice tone="success">Votre adresse e-mail est confirmée.</Notice>
            <Link href="/app/bienvenue" className="btn-primary w-full">
              Continuer
            </Link>
          </div>
        ) : (
          <Notice tone="danger">{r?.error ?? "Ce lien n'est plus valable."}</Notice>
        )}
      </AuthCard>
    );
  }
  const ctx = await getCtx();
  let verified = false;
  if (ctx) {
    const db = await getDb();
    const rows = await db.query<{ email_verified_at: Date | null }>("SELECT email_verified_at FROM users WHERE id=$1", [ctx.userId]);
    verified = !!rows[0]?.email_verified_at;
  }
  return (
    <AuthCard title="Confirmez votre adresse e-mail">
      {verified ? (
        <Link href="/app" className="btn-primary w-full">
          Votre adresse est déjà confirmée : ouvrir l'application
        </Link>
      ) : (
        <div className="space-y-4 text-sm">
          <p>
            Un lien de confirmation a été envoyé à <strong>{ctx?.email ?? "votre adresse"}</strong>. Cliquez dessus pour activer votre compte.
          </p>
          <Notice tone="info">
            Version de démonstration : aucun e-mail n'est réellement envoyé. Le message est visible dans la{" "}
            <Link href="/boite-de-test" className="link">
              boîte de test
            </Link>
            .
          </Notice>
          {ctx ? <ResendButton /> : null}
        </div>
      )}
    </AuthCard>
  );
}
