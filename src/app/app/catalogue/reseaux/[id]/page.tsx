import Link from "next/link";
import { pendingRecommendations } from "@/lib/services/network-recommendations";
import { notFound } from "next/navigation";
import { networkImportAction, networkLeaveAction, networkShareAction, networkUnshareAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { getNetwork } from "@/lib/services/networks";

export const metadata = { title: "Réseau d'artisans" };

export default async function NetworkPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const ctx = await requirePageCtx();
  const { id } = await params;
  const sp = await searchParams;
  let n;
  try {
    n = await getNetwork(ctx, id, sp.q ?? "");
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  }
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const others = n.items.filter((i) => !i.mine);
  const mine = n.items.filter((i) => i.mine);
  const shareable = n.myItems.filter((i) => !i.shared);
  const pending = await pendingRecommendations(ctx);
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={n.name}
        subtitle={
          n.description ||
          `${n.members.length} membre${n.members.length > 1 ? "s" : ""}, ${n.items.length} ouvrage${n.items.length > 1 ? "s" : ""} partagé${n.items.length > 1 ? "s" : ""}.`
        }
        back={{ href: "/app/catalogue/reseaux", label: "Réseaux d'artisans" }}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/app/catalogue/reseaux/${n.id}/recommandations`} className="btn-secondary">
              <Icon name="send" size={16} /> Recommandations{pending ? ` (${pending})` : ""}
            </Link>
            <Link href={`/app/catalogue/reseaux/${n.id}/achats`} className="btn-secondary">
              <Icon name="truck" size={16} /> Achats groupés
            </Link>
            <Link href={`/app/catalogue/reseaux/${n.id}/bourse`} className="btn-secondary">
              <Icon name="team" size={16} /> Bourse aux missions et matériaux
            </Link>
          </div>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Section
            title="Bibliothèque du réseau"
            description="Ouvrages partagés par les autres membres. Les coûts d'achat et les fournisseurs ne sont jamais partagés."
          >
            <form method="get" className="mb-3 flex gap-2">
              <label className="sr-only" htmlFor="net-q">
                Rechercher un ouvrage
              </label>
              <input id="net-q" name="q" className="field" defaultValue={sp.q ?? ""} placeholder="Rechercher un ouvrage" />
              <button type="submit" className="btn-secondary">
                Rechercher
              </button>
            </form>
            {others.length ? (
              <ActionForm action={networkImportAction} className="space-y-3">
                <input type="hidden" name="networkId" value={n.id} />
                <ul className="divide-y divide-line text-sm" data-testid="bibliotheque-reseau">
                  {others.map((i) => (
                    <li key={i.id} className="flex items-start gap-3 py-2">
                      <input
                        type="checkbox"
                        name="item"
                        value={i.id}
                        id={`imp-${i.id}`}
                        className="mt-1 h-5 w-5"
                        disabled={i.owned || !canEdit}
                        defaultChecked={false}
                      />
                      <label htmlFor={`imp-${i.id}`} className="min-w-0 flex-1">
                        <span className="font-medium">{i.name}</span>
                        <span className="block text-xs text-muted">
                          {i.publisher}
                          {i.imports ? `, repris ${i.imports} fois` : ""}
                          {i.owned ? ", déjà dans votre catalogue" : ""}
                        </span>
                        {i.description ? <span className="block text-xs text-muted">{i.description}</span> : null}
                      </label>
                      <span className="tabular text-right">
                        {i.priceCents !== null ? `${formatEuros(i.priceCents)} HT` : <span className="text-muted">prix non partagé</span>}
                        <span className="block text-xs text-muted">par {i.unit}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {canEdit ? <Submit className="btn-primary">Ajouter à mon catalogue</Submit> : null}
              </ActionForm>
            ) : (
              <p className="text-sm text-muted">{sp.q ? "Aucun ouvrage ne correspond." : "Les autres membres n'ont encore rien partagé."}</p>
            )}
          </Section>

          {canEdit ? (
            <Section
              title="Partager mes ouvrages"
              description="Le libellé, la description, l'unité, la TVA et la durée sont partagés ; le prix de vente seulement si vous le cochez."
            >
              {mine.length ? (
                <ul className="mb-4 divide-y divide-line text-sm" data-testid="mes-partages">
                  {mine.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span>
                        {i.name}
                        <span className="block text-xs text-muted">{i.imports ? `Repris ${i.imports} fois` : "Pas encore repris"}</span>
                      </span>
                      <form action={networkUnshareAction}>
                        <input type="hidden" name="networkId" value={n.id} />
                        <input type="hidden" name="itemId" value={i.id} />
                        <button type="submit" className="link inline-flex min-h-6 items-center text-xs text-danger">
                          Ne plus partager
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : null}
              {shareable.length ? (
                <ActionForm action={networkShareAction} className="space-y-3">
                  <input type="hidden" name="networkId" value={n.id} />
                  <fieldset>
                    <legend className="label">Ouvrages de votre catalogue</legend>
                    <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border border-line p-2 text-sm" tabIndex={0} aria-label="Ouvrages à partager">
                      {shareable.map((i) => (
                        <li key={i.id}>
                          <label className="flex min-h-6 items-center gap-2">
                            <input type="checkbox" name="item" value={i.id} className="h-5 w-5" />
                            {i.name} <span className="text-xs text-muted">({i.unit})</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </fieldset>
                  <label className="flex min-h-6 items-center gap-2 text-sm">
                    <input type="checkbox" name="withPrices" value="1" className="h-5 w-5" /> Partager aussi mes prix de vente
                  </label>
                  <Submit className="btn-secondary">Partager</Submit>
                </ActionForm>
              ) : (
                <p className="text-sm text-muted">Tous vos ouvrages actifs sont déjà partagés.</p>
              )}
            </Section>
          ) : null}
        </div>

        <aside className="h-fit space-y-4">
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-semibold">Membres</h2>
            <ul className="space-y-2" data-testid="membres-reseau">
              {n.members.map((m) => (
                <li key={m.org_id}>
                  <span className="font-medium">{m.name}</span>
                  {m.me ? " (vous)" : ""}
                  <span className="block text-xs text-muted">
                    {[
                      m.trade,
                      m.city,
                      m.role === "animateur" ? "animateur" : "",
                      `${m.shared} ouvrage${m.shared > 1 ? "s" : ""} partagé${m.shared > 1 ? "s" : ""}`,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-semibold">Inviter un confrère</h2>
            <p className="text-muted">Transmettez ce code : il le saisit dans Catalogue, Réseaux, Rejoindre un réseau.</p>
            <p className="mt-2 font-mono text-lg tracking-widest" data-testid="code-reseau">
              {n.joinCode}
            </p>
          </section>
          {can(ctx, "settings") && canEdit ? (
            <form action={networkLeaveAction}>
              <input type="hidden" name="networkId" value={n.id} />
              <button type="submit" className="link inline-flex min-h-6 items-center text-sm text-danger">
                Quitter le réseau
              </button>
            </form>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
