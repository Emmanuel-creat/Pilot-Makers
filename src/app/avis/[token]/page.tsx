import { Notice } from "@/components/ui";
import { getDb } from "@/lib/db";
import { reviewInvitation } from "@/lib/services/reviews";
import { ReviewForm } from "./ReviewForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Votre avis", robots: { index: false, follow: false } };

/** Page où le client donne son avis sur un chantier, depuis le lien reçu. */
export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await reviewInvitation(await getDb(), token);
  return (
    <main className="min-h-screen bg-bg px-4 py-8">
      <div className="card mx-auto max-w-xl space-y-4 p-6">
        {!inv ? (
          <Notice tone="warning" title="Lien invalide ou expiré">
            Ce lien ne permet plus de donner un avis. Contactez l&apos;entreprise si besoin.
          </Notice>
        ) : inv.review.submittedAt ? (
          <Notice tone="success" title="Avis déjà enregistré">
            Merci, votre avis sur les travaux « {inv.review.jobTitle} » a bien été transmis à {inv.orgName}.
          </Notice>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-semibold">Votre avis sur {inv.orgName}</h1>
              <p className="text-sm text-muted">Travaux : {inv.review.jobTitle}</p>
            </div>
            <ReviewForm token={token} orgName={inv.orgName} />
          </>
        )}
      </div>
    </main>
  );
}
