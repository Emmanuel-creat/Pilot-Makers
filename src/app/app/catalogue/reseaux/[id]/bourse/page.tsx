import { networkCloseAction, networkPostAction, networkReplyAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { POST_KINDS, POST_STATUSES } from "@/lib/network-board";
import { requirePageCtx } from "@/lib/server/session";
import { networkBoard } from "@/lib/services/network-board";

export const metadata = { title: "Bourse du réseau" };

const fr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function NetworkBoardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const b = await networkBoard(ctx, id);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Bourse du réseau"
        subtitle={`${b.name} : missions de renfort pour absorber un pic de travail, et matériaux restants à céder plutôt qu'à jeter.`}
        back={{ href: `/app/catalogue/reseaux/${id}`, label: b.name }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Section title="Annonces">
          {b.posts.length ? (
            <ul className="divide-y divide-border text-sm" data-testid="bourse">
              {b.posts.map((p) => (
                <li key={p.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">
                        {POST_KINDS[p.kind]}
                        {p.status !== "ouverte" ? `, ${POST_STATUSES[p.status].toLowerCase()}` : ""}
                      </p>
                      <p className="font-medium">{p.title}</p>
                      <p className="text-muted">
                        {[
                          p.mine ? "Votre annonce" : p.publisher,
                          p.city,
                          p.trade,
                          p.kind === "mission" && p.start && p.end ? `du ${fr(p.start)} au ${fr(p.end)}` : "",
                          p.kind === "materiau" ? `${p.quantity} ${p.unit}`.trim() : "",
                          p.kind === "materiau" ? (p.priceCents ? `${formatEuros(p.priceCents)} demandés` : "gratuit ou à débattre") : "",
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </p>
                      {p.detail ? <p className="whitespace-pre-line text-muted">{p.detail}</p> : null}
                    </div>
                    {p.mine && p.status === "ouverte" && writable ? (
                      <div className="flex gap-2">
                        <ActionForm action={networkCloseAction}>
                          <input type="hidden" name="postId" value={p.id} />
                          <input type="hidden" name="status" value="pourvue" />
                          <Submit className="btn-secondary">Pourvue</Submit>
                        </ActionForm>
                        <ActionForm action={networkCloseAction}>
                          <input type="hidden" name="postId" value={p.id} />
                          <input type="hidden" name="status" value="retiree" />
                          <Submit className="btn-secondary">Retirer</Submit>
                        </ActionForm>
                      </div>
                    ) : null}
                  </div>
                  {p.mine ? (
                    p.responses.length ? (
                      <ul className="space-y-1 rounded-md bg-surface-2 p-3 text-xs" aria-label={`Réponses à ${p.title}`}>
                        {p.responses.map((r, i) => (
                          <li key={i}>
                            <span className="font-medium">{r.name}</span>
                            {[r.city, r.phone, r.email].filter(Boolean).length ? `, ${[r.city, r.phone, r.email].filter(Boolean).join(", ")}` : ""}
                            {r.message ? <span className="block text-muted">{r.message}</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted">Pas encore de réponse.</p>
                    )
                  ) : p.replied ? (
                    <p className="text-xs text-success">Vous avez répondu : l&apos;auteur a vos coordonnées.</p>
                  ) : writable ? (
                    <ActionForm action={networkReplyAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="postId" value={p.id} />
                      <input type="hidden" name="networkId" value={id} />
                      <label className="min-w-0 flex-1 text-xs">
                        <span className="mb-1 block font-medium">Message à {p.publisher}</span>
                        <input name="message" className="field" maxLength={1000} placeholder="Disponibilités, conditions" />
                      </label>
                      <Submit className="btn-secondary">Je suis intéressé</Submit>
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="team" title="Aucune annonce pour l'instant" />
          )}
        </Section>
        {writable ? (
          <Section title="Publier une annonce" description="Visible par les membres du réseau. Les membres qui répondent vous laissent leurs coordonnées.">
            <ActionForm action={networkPostAction} resetOnSuccess className="space-y-3 text-sm">
              <input type="hidden" name="networkId" value={id} />
              <label className="block">
                <span className="mb-1 block font-medium">Type</span>
                <select name="kind" className="field" defaultValue="mission">
                  <option value="mission">{POST_KINDS.mission}</option>
                  <option value="materiau">{POST_KINDS.materiau}</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Titre</span>
                <input name="title" className="field" required maxLength={140} placeholder="Carreleur pour une semaine" />
              </label>
              <label className="block">
                <span className="mb-1 block font-medium">Détails</span>
                <textarea name="detail" className="field min-h-20" maxLength={2000} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label>
                  <span className="mb-1 block font-medium">Métier</span>
                  <input name="trade" className="field" maxLength={60} />
                </label>
                <label>
                  <span className="mb-1 block font-medium">Ville</span>
                  <input name="city" className="field" maxLength={80} />
                </label>
              </div>
              <fieldset className="grid grid-cols-2 gap-3">
                <legend className="mb-1 font-medium">Mission</legend>
                <label>
                  <span className="mb-1 block text-xs">Du</span>
                  <input type="date" name="start" className="field" />
                </label>
                <label>
                  <span className="mb-1 block text-xs">Au</span>
                  <input type="date" name="end" className="field" />
                </label>
              </fieldset>
              <fieldset className="grid grid-cols-3 gap-3">
                <legend className="mb-1 font-medium">Matériaux</legend>
                <label>
                  <span className="mb-1 block text-xs">Quantité</span>
                  <input name="quantity" className="field" maxLength={20} />
                </label>
                <label>
                  <span className="mb-1 block text-xs">Unité</span>
                  <input name="unit" className="field" maxLength={20} />
                </label>
                <label>
                  <span className="mb-1 block text-xs">Prix (€)</span>
                  <input name="price" inputMode="decimal" className="field" maxLength={20} />
                </label>
              </fieldset>
              <Submit>Publier</Submit>
            </ActionForm>
          </Section>
        ) : null}
      </div>
    </div>
  );
}
