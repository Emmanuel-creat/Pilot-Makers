import Link from "next/link";
import { renovationAddAction, renovationAnswerAction, renovationRemoveAction, renovationShareAction, renovationUpdateAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { TRADES } from "@/lib/coordination";
import { STATUS_LABELS, tradeLabel } from "@/lib/renovation";
import { requirePageCtx } from "@/lib/server/session";
import { getRenovation, myQuoteOptions, renovationPeers } from "@/lib/services/renovation";

export const metadata = { title: "Rénovation coordonnée" };

const fr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

function TradeSelect({ id, value }: { id: string; value?: string }) {
  return (
    <select id={id} name="trade" className="field" defaultValue={value ?? "autre"}>
      {TRADES.map((t) => (
        <option key={t.key} value={t.key}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

/** Dossier de rénovation coordonnée : entreprises, devis, enchaînement et lien du client. */
export default async function RenovationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const r = await getRenovation(ctx, id);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const me = r.myParticipant;
  const [peers, quotes] = await Promise.all([
    r.isPilot ? renovationPeers(ctx) : Promise.resolve([]),
    me && me.status !== "invite" && me.status !== "refuse" ? myQuoteOptions(ctx) : Promise.resolve([]),
  ]);
  const inFile = new Set(r.participants.map((p) => p.orgId));
  const s = r.summary;
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={r.title}
        subtitle={
          r.isPilot ? `Vous pilotez ce dossier${r.customer ? ` pour ${r.customer}` : ""}.` : `Dossier piloté par ${r.pilot}. Le client échange avec le pilote.`
        }
        back={{ href: "/app/renovations", label: "Rénovations coordonnées" }}
      />

      {me?.status === "invite" && canEdit ? (
        <Notice tone="info" title="Invitation à intervenir sur ce dossier">
          <p className="mb-2">
            Vous gardez votre propre devis et votre responsabilité ; {r.pilot} coordonne les dates et reste l&apos;interlocuteur du client.
          </p>
          <div className="flex flex-wrap gap-2">
            <ActionForm action={renovationAnswerAction}>
              <input type="hidden" name="participantId" value={me.id} />
              <input type="hidden" name="accept" value="1" />
              <Submit>Participer</Submit>
            </ActionForm>
            <ActionForm action={renovationAnswerAction}>
              <input type="hidden" name="participantId" value={me.id} />
              <input type="hidden" name="accept" value="0" />
              <Submit className="btn-secondary">Décliner</Submit>
            </ActionForm>
          </div>
        </Notice>
      ) : null}

      <section className="card grid gap-4 p-4 sm:grid-cols-3" aria-label="Synthèse du dossier">
        <div>
          <p className="text-sm text-muted">Total TTC des devis</p>
          <p className="text-2xl font-semibold tabular-nums" data-testid="renovation-total">
            {s.totalTtcCents == null ? "Visible par le pilote" : formatEuros(s.totalTtcCents)}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted">Période des travaux</p>
          <p className="font-medium">{s.from && s.to ? `Du ${fr(s.from)} au ${fr(s.to)}` : "Dates à fixer"}</p>
        </div>
        <div>
          <p className="text-sm text-muted">Devis</p>
          <p className="font-medium">
            {s.complete
              ? "Tous les devis sont rassemblés"
              : `${s.missingQuotes.length + s.waiting.length} entreprise${s.missingQuotes.length + s.waiting.length > 1 ? "s" : ""} à compléter`}
            {s.accepted ? `, ${s.accepted} accepté${s.accepted > 1 ? "s" : ""}` : ""}
          </p>
        </div>
      </section>

      {s.issues.length ? (
        <Notice tone="warning" title="Enchaînement à vérifier">
          <ul className="list-disc pl-5">
            {s.issues.map((i) => (
              <li key={`${i.id}-${i.kind}`}>{i.text}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <section className="card p-4" aria-labelledby="rc-entreprises">
        <h2 id="rc-entreprises" className="mb-3 font-semibold">
          Entreprises et devis
        </h2>
        <ul className="divide-y divide-line">
          {s.participants.map((p) => {
            const full = r.participants.find((x) => x.id === p.id)!;
            const mine = full.orgId === ctx.orgId;
            return (
              <li key={p.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {p.name} <span className="text-sm font-normal text-muted">, {tradeLabel(p.trade)}</span>
                    </p>
                    <p className="text-sm text-muted">
                      {STATUS_LABELS[p.status]}
                      {p.startDate && p.endDate ? `, du ${fr(p.startDate)} au ${fr(p.endDate)}` : ""}
                    </p>
                  </div>
                  <p className="text-sm tabular-nums">
                    {full.amountTtcCents != null ? formatEuros(full.amountTtcCents) : p.hasQuote ? "Devis remis" : "Devis attendu"}
                    {full.quoteId ? (
                      <>
                        {" "}
                        <Link href={`/app/devis/${full.quoteId}`} className="link">
                          {full.quoteNumber || "voir"}
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                {canEdit && mine && p.status !== "invite" && p.status !== "refuse" ? (
                  <ActionForm action={renovationUpdateAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="participantId" value={p.id} />
                    <input type="hidden" name="kind" value="quote" />
                    <div>
                      <label className="label" htmlFor={`rc-devis-${p.id}`}>
                        Votre devis pour ce lot
                      </label>
                      <select id={`rc-devis-${p.id}`} name="quoteId" className="field" defaultValue={full.quoteId ?? ""}>
                        <option value="">Aucun</option>
                        {quotes.map((q) => (
                          <option key={q.id} value={q.id}>
                            {q.number ? `${q.number} : ` : ""}
                            {q.title || "Devis sans titre"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Submit className="btn-secondary">Rattacher</Submit>
                  </ActionForm>
                ) : null}
                {canEdit && r.isPilot ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <ActionForm action={renovationUpdateAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="participantId" value={p.id} />
                      <input type="hidden" name="kind" value="dates" />
                      <div>
                        <label className="label" htmlFor={`rc-lot-${p.id}`}>
                          Lot
                        </label>
                        <TradeSelect id={`rc-lot-${p.id}`} value={p.trade} />
                      </div>
                      <div>
                        <label className="label" htmlFor={`rc-debut-${p.id}`}>
                          Début
                        </label>
                        <input id={`rc-debut-${p.id}`} type="date" name="start" className="field" defaultValue={p.startDate ?? ""} />
                      </div>
                      <div>
                        <label className="label" htmlFor={`rc-fin-${p.id}`}>
                          Fin
                        </label>
                        <input id={`rc-fin-${p.id}`} type="date" name="end" className="field" defaultValue={p.endDate ?? ""} />
                      </div>
                      <Submit className="btn-secondary">Enregistrer</Submit>
                    </ActionForm>
                    {p.status === "externe" ? (
                      <ActionForm action={renovationUpdateAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="participantId" value={p.id} />
                        <input type="hidden" name="kind" value="amount" />
                        <div>
                          <label className="label" htmlFor={`rc-montant-${p.id}`}>
                            Montant TTC du devis
                          </label>
                          <input
                            id={`rc-montant-${p.id}`}
                            name="amount"
                            className="field"
                            inputMode="decimal"
                            defaultValue={full.amountTtcCents != null ? (full.amountTtcCents / 100).toFixed(2).replace(".", ",") : ""}
                          />
                        </div>
                        <Submit className="btn-secondary">Enregistrer</Submit>
                      </ActionForm>
                    ) : null}
                    {p.status !== "pilote" ? (
                      <ActionForm action={renovationRemoveAction}>
                        <input type="hidden" name="participantId" value={p.id} />
                        <Submit className="btn-secondary">
                          <Icon name="trash" size={16} /> Retirer
                        </Submit>
                      </ActionForm>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>

      {canEdit && r.isPilot ? (
        <>
          <section className="card space-y-4 p-4" aria-labelledby="rc-ajout">
            <h2 id="rc-ajout" className="font-semibold">
              Ajouter une entreprise
            </h2>
            {peers.filter((x) => !inFile.has(x.org_id)).length ? (
              <ActionForm action={renovationAddAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="projectId" value={r.id} />
                <div>
                  <label className="label" htmlFor="rc-confrere">
                    Confrère de vos réseaux
                  </label>
                  <select id="rc-confrere" name="orgId" className="field" required defaultValue="">
                    <option value="" disabled>
                      Choisir
                    </option>
                    {peers
                      .filter((x) => !inFile.has(x.org_id))
                      .map((x) => (
                        <option key={x.org_id} value={x.org_id}>
                          {x.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="rc-confrere-lot">
                    Lot
                  </label>
                  <TradeSelect id="rc-confrere-lot" />
                </div>
                <Submit>Inviter</Submit>
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">
                Pour inviter un confrère qui utilise l&apos;application, rejoignez un même réseau dans{" "}
                <Link href="/app/catalogue/reseaux" className="link">
                  Réseaux de confrères
                </Link>
                .
              </p>
            )}
            <ActionForm action={renovationAddAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="projectId" value={r.id} />
              <div>
                <label className="label" htmlFor="rc-externe">
                  Entreprise hors application
                </label>
                <input id="rc-externe" name="name" className="field" required minLength={2} maxLength={160} />
              </div>
              <div>
                <label className="label" htmlFor="rc-externe-lot">
                  Lot
                </label>
                <TradeSelect id="rc-externe-lot" />
              </div>
              <div>
                <label className="label" htmlFor="rc-externe-montant">
                  Montant TTC (facultatif)
                </label>
                <input id="rc-externe-montant" name="amount" className="field" inputMode="decimal" />
              </div>
              <Submit className="btn-secondary">Ajouter</Submit>
            </ActionForm>
          </section>

          <section className="card space-y-2 p-4" aria-labelledby="rc-client">
            <h2 id="rc-client" className="font-semibold">
              Lien du client
            </h2>
            <p className="text-sm text-muted">
              Le client voit toutes les entreprises, leurs devis, l&apos;enchaînement des travaux et vos coordonnées comme seul interlocuteur.
              {r.shared ? " Un lien existe déjà : en créer un nouveau désactive l'ancien." : ""}
            </p>
            <ActionForm action={renovationShareAction}>
              <input type="hidden" name="projectId" value={r.id} />
              <Submit className="btn-secondary">
                <Icon name="link" size={16} /> {r.shared ? "Créer un nouveau lien" : "Créer le lien du client"}
              </Submit>
            </ActionForm>
          </section>
        </>
      ) : null}
    </div>
  );
}
