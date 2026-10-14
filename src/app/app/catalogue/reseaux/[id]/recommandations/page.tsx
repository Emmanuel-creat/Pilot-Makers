import Link from "next/link";
import { recommendAction, recommendationAnswerAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section, fmtDate } from "@/components/ui";
import { RECO_STATUSES } from "@/lib/recommendations";
import { requirePageCtx } from "@/lib/server/session";
import { recommendationsBoard, type Recommendation } from "@/lib/services/network-recommendations";

export const metadata = { title: "Recommandations du réseau" };

function Contact({ r }: { r: Recommendation }) {
  const parts = [r.city, r.phone, r.email].filter(Boolean);
  return parts.length ? <p className="text-muted">{parts.join(", ")}</p> : null;
}

export default async function RecommendationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const b = await recommendationsBoard(ctx, id);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Recommandations"
        subtitle={`${b.name} : transmettez à un confrère d'un métier complémentaire le client qui a besoin de lui, et recevez les siens.`}
        back={{ href: `/app/catalogue/reseaux/${id}`, label: b.name }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Section title="Reçues">
            {b.received.length ? (
              <ul className="divide-y divide-border text-sm" data-testid="recos-recues">
                {b.received.map((r) => (
                  <li key={r.id} className="space-y-2 py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      {RECO_STATUSES[r.status]}, de {r.partner} le {fmtDate(r.createdAt)}
                    </p>
                    <p className="font-medium">{r.customerName}</p>
                    <p className="whitespace-pre-line">{r.need}</p>
                    <Contact r={r} />
                    {r.status === "envoyee" && writable ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <ActionForm action={recommendationAnswerAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="accept" />
                          <Submit className="btn-primary">Accepter et créer la demande</Submit>
                        </ActionForm>
                        <ActionForm action={recommendationAnswerAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="decision" value="decline" />
                          <div>
                            <label className="label" htmlFor={`note-${r.id.slice(0, 8)}`}>
                              Motif (facultatif)
                            </label>
                            <input
                              id={`note-${r.id.slice(0, 8)}`}
                              name="note"
                              className="field"
                              maxLength={500}
                              placeholder="Ex. : planning complet jusqu'en mars"
                            />
                          </div>
                          <Submit className="btn-secondary">Décliner</Submit>
                        </ActionForm>
                      </div>
                    ) : null}
                    {r.status === "acceptee" ? (
                      <Link className="link" href="/app/demandes">
                        Voir dans les demandes
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon="inbox" title="Aucune recommandation reçue">
                Les clients que vos confrères vous transmettent arrivent ici, avec leur besoin. Leurs coordonnées s&apos;affichent quand vous acceptez.
              </Empty>
            )}
          </Section>
          <Section title="Envoyées">
            {b.sent.length ? (
              <ul className="divide-y divide-border text-sm" data-testid="recos-envoyees">
                {b.sent.map((r) => (
                  <li key={r.id} className="py-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      {r.signed ? "Devis signé" : RECO_STATUSES[r.status]}, à {r.partner} le {fmtDate(r.createdAt)}
                    </p>
                    <p className="font-medium">{r.customerName}</p>
                    <p className="text-muted">{r.need}</p>
                    {r.replyNote ? <p>Réponse : {r.replyNote}</p> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Vous n&apos;avez encore recommandé personne.</p>
            )}
          </Section>
        </div>
        {writable ? (
          <Section title="Recommander un client">
            {b.targets.length ? (
              <ActionForm action={recommendAction} resetOnSuccess className="space-y-3">
                <input type="hidden" name="networkId" value={id} />
                <div>
                  <label className="label" htmlFor="reco-to">
                    Confrère
                  </label>
                  <select id="reco-to" name="toOrg" className="field">
                    {b.targets.map((t) => (
                      <option key={t.orgId} value={t.orgId}>
                        {t.name}
                        {t.tradeLabel ? `, ${t.tradeLabel}` : ""}
                        {t.complementary ? " (métier complémentaire)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="reco-name">
                    Client
                  </label>
                  <input id="reco-name" name="customerName" className="field" maxLength={160} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <div>
                    <label className="label" htmlFor="reco-phone">
                      Téléphone
                    </label>
                    <input id="reco-phone" name="phone" className="field" inputMode="tel" maxLength={30} />
                  </div>
                  <div>
                    <label className="label" htmlFor="reco-email">
                      E-mail
                    </label>
                    <input id="reco-email" name="email" type="email" className="field" maxLength={254} />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="reco-city">
                    Commune
                  </label>
                  <input id="reco-city" name="city" className="field" maxLength={120} />
                </div>
                <div>
                  <label className="label" htmlFor="reco-need">
                    Besoin du client
                  </label>
                  <textarea
                    id="reco-need"
                    name="need"
                    className="field"
                    rows={3}
                    maxLength={2000}
                    placeholder="Ex. : salle de bains refaite, faïence murale à poser sur 12 m² début mai"
                  />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="consent" className="mt-1" />
                  <span>Le client a accepté que je transmette ses coordonnées à ce confrère.</span>
                </label>
                <Submit className="btn-primary">Envoyer la recommandation</Submit>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">Invitez d&apos;autres artisans dans ce réseau pour leur recommander vos clients.</p>
            )}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
