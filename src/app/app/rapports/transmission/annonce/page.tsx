import Link from "next/link";
import { notFound } from "next/navigation";
import { transferListingSaveAction, transferListingStatusAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { bandLabel, LISTING_STATUS, listingRef, REASONS, REVENUE_BANDS, STAFF_BANDS } from "@/lib/business-takeover";
import { requirePageCtx } from "@/lib/server/session";
import { myTransferListing } from "@/lib/services/business-takeover";
import { can } from "@/lib/services/context";

export const metadata = { title: "Annonce de reprise" };

/** Annonce anonyme pour trouver un repreneur, et prises de contact reçues. */
export default async function TransferListingPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const { listing: l, contacts, computed } = await myTransferListing(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Trouver un repreneur"
        subtitle="Une annonce anonyme sur la plateforme de reprise : ni nom, ni adresse, ni coordonnées. Les repreneurs vous écrivent, vous choisissez à qui répondre."
        back={{ href: "/app/rapports/transmission", label: "Transmission" }}
      />
      <div className="space-y-6">
        {l ? (
          <Notice tone={l.status === "publiee" ? "success" : "info"} title={`Annonce ${listingRef(l.id)} : ${LISTING_STATUS[l.status].toLowerCase()}`}>
            {l.status === "publiee" ? (
              <>
                Visible sur{" "}
                <Link href={`/reprendre-une-entreprise/${l.id}`} className="link">
                  la plateforme de reprise
                </Link>
                {l.publishedAt ? ` depuis le ${fmtDate(l.publishedAt)}` : ""}.
              </>
            ) : (
              "Elle n'est pas visible des repreneurs."
            )}
          </Notice>
        ) : null}
        <Section
          title="Ce que l'annonce affiche d'office"
          description="Calculé depuis vos chiffres, recalculé à chaque enregistrement : rien n'est saisi à la main."
        >
          <dl className="grid gap-3 text-sm sm:grid-cols-2" data-testid="reprise-tranches">
            <div>
              <dt className="text-muted">Métier</dt>
              <dd className="font-medium">{computed.trade || "À renseigner dans le profil"}</dd>
            </div>
            <div>
              <dt className="text-muted">Département</dt>
              <dd className="font-medium">{computed.department || "À renseigner dans le profil"}</dd>
            </div>
            <div>
              <dt className="text-muted">Chiffre d&apos;affaires moyen</dt>
              <dd className="font-medium">{bandLabel(REVENUE_BANDS, computed.revenueBand)}</dd>
            </div>
            <div>
              <dt className="text-muted">Effectif</dt>
              <dd className="font-medium">{bandLabel(STAFF_BANDS, computed.staffBand)}</dd>
            </div>
          </dl>
        </Section>
        <Section
          title="Votre annonce"
          description="Décrivez l'activité, la clientèle, le matériel et le local sans citer de nom, de rue ni de coordonnées : l'annonce est vérifiée avant publication."
        >
          <ActionForm action={transferListingSaveAction}>
            <div>
              <label className="label" htmlFor="tl-headline">
                Titre
              </label>
              <input id="tl-headline" name="headline" className="field" defaultValue={l?.headline ?? ""} maxLength={120} required />
            </div>
            <div>
              <label className="label" htmlFor="tl-description">
                Description
              </label>
              <textarea id="tl-description" name="description" className="field" rows={7} defaultValue={l?.description ?? ""} maxLength={4000} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="tl-reason">
                  Raison de la cession
                </label>
                <select id="tl-reason" name="reason" className="field" defaultValue={l?.reason ?? "retraite"}>
                  {Object.entries(REASONS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="tl-months">
                  Accompagnement du repreneur (mois)
                </label>
                <input id="tl-months" name="accompanimentMonths" type="number" min={0} max={24} className="field" defaultValue={l?.accompanimentMonths ?? 6} />
              </div>
            </div>
            <Submit>Enregistrer l&apos;annonce</Submit>
          </ActionForm>
          {l ? (
            <ActionForm action={transferListingStatusAction} className="mt-4 flex flex-wrap items-center gap-3">
              <input type="hidden" name="status" value={l.status === "publiee" ? "retiree" : "publiee"} />
              <Submit className={l.status === "publiee" ? "btn-secondary" : "btn-primary"}>
                {l.status === "publiee" ? "Retirer l'annonce" : "Publier l'annonce"}
              </Submit>
            </ActionForm>
          ) : null}
        </Section>
        <Section
          title="Repreneurs intéressés"
          description="Leurs messages vous parviennent aussi par e-mail. Ils ne connaissent pas votre identité tant que vous ne leur répondez pas."
        >
          {contacts.length ? (
            <ul className="divide-y divide-line" data-testid="reprise-contacts">
              {contacts.map((c) => (
                <li key={c.id} className="space-y-1 py-3 text-sm">
                  <p className="font-medium">
                    {c.name} <span className="font-normal text-muted">le {fmtDate(c.createdAt)}</span>
                  </p>
                  <p className="whitespace-pre-line">{c.message}</p>
                  <p className="text-muted">{[c.phone, c.email].filter(Boolean).join(" ; ")}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Aucune prise de contact pour le moment.</p>
          )}
        </Section>
      </div>
    </div>
  );
}
