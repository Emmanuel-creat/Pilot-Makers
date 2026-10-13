import { PageHeader, Section, Empty, fmtDate } from "@/components/ui";
import Link from "next/link";
import { averageRating, HIDE_REASONS } from "@/lib/reviews";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { listReviews } from "@/lib/services/reviews";
import { HideReviewForm, ReplyReviewForm, ShowReviewForm } from "./ReviewForms";

export const metadata = { title: "Avis clients" };

export default async function ReviewsPage() {
  const ctx = await requirePageCtx();
  const reviews = await listReviews(ctx);
  const done = reviews.filter((r) => r.submittedAt);
  const avg = averageRating(done.filter((r) => !r.hiddenReason).map((r) => r.rating!));
  const canEdit = can(ctx, "settings") && !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Avis clients"
        subtitle={
          avg.count
            ? `Note moyenne ${avg.average!.toLocaleString("fr-FR")} sur 5, ${avg.count} avis. ${reviews.length - done.length} invitation(s) sans réponse.`
            : "Demandez un avis depuis la fiche d'un chantier terminé : il apparaît ici, puis sur votre vitrine si le client l'accepte."
        }
        back={{ href: "/app/chantiers", label: "Chantiers" }}
      />
      {done.length ? (
        <Section
          title="Avis reçus"
          description="Publiés tels quels sur la vitrine quand le client l'a accepté. Seul un avis injurieux, hors sujet ou citant un tiers peut être masqué."
        >
          <ul className="divide-y divide-line" aria-label="Avis reçus">
            {done.map((r) => (
              <li key={r.id} className="space-y-2 py-4 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">
                    {r.rating} sur 5, {r.authorName}
                    {r.city ? `, ${r.city}` : ""}
                  </span>
                  <span className="text-xs text-muted">
                    {fmtDate(r.submittedAt!)} :{" "}
                    <Link className="link" href={`/app/chantiers/${r.jobId}`}>
                      {r.jobTitle}
                    </Link>
                  </span>
                </div>
                {r.comment ? <p className="whitespace-pre-line">{r.comment}</p> : <p className="text-muted">Sans commentaire.</p>}
                <p className="text-xs text-muted">
                  {r.hiddenReason
                    ? `Masqué : ${HIDE_REASONS[r.hiddenReason]}.`
                    : r.publishConsent
                      ? "Publié sur la vitrine."
                      : "Le client n'a pas souhaité de publication."}
                </p>
                {canEdit ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ReplyReviewForm id={r.id} reply={r.reply} />
                    {r.hiddenReason ? <ShowReviewForm id={r.id} /> : <HideReviewForm id={r.id} reasons={Object.entries(HIDE_REASONS)} />}
                  </div>
                ) : r.reply ? (
                  <p className="border-l-2 border-line pl-3">Votre réponse : {r.reply}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Empty icon="star" title="Aucun avis pour l'instant">
          Ouvrez un chantier terminé et cliquez sur « Demander un avis au client ».
        </Empty>
      )}
    </div>
  );
}
