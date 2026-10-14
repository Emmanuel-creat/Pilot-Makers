import { Notice } from "@/components/ui";
import { getDb } from "@/lib/db";
import { unsubscribeInfo } from "@/lib/services/campaigns";

export const dynamic = "force-dynamic";
export const metadata = { title: "Désinscription", robots: { index: false, follow: false } };

/** Page du lien de désinscription : un clic confirme, sans compte ni mot de passe. */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const info = await unsubscribeInfo(await getDb(), token);
  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <div className="card mx-auto max-w-xl space-y-4 p-6">
        {!info ? (
          <Notice tone="warning" title="Lien invalide">
            Ce lien de désinscription n&apos;est pas reconnu.
          </Notice>
        ) : info.unsubscribed ? (
          <Notice tone="success" title="Désinscription enregistrée">
            Vous ne recevrez plus les offres de {info.orgName}. Les messages liés à vos devis et factures continuent de vous parvenir.
          </Notice>
        ) : (
          <>
            <h1 className="text-xl font-semibold">Ne plus recevoir les offres de {info.orgName}</h1>
            <p className="text-sm text-muted">Les messages liés à vos devis et factures en cours continueront de vous parvenir.</p>
            <form method="post" action={`/api/public/desinscription/${token}`}>
              <button className="btn-primary">Me désinscrire</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
