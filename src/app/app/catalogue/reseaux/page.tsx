import Link from "next/link";
import { networkCreateAction, networkJoinAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { listNetworks } from "@/lib/services/networks";

export const metadata = { title: "Réseaux d'artisans" };

export default async function NetworksPage() {
  const ctx = await requirePageCtx();
  const list = await listNetworks(ctx);
  const canManage = can(ctx, "settings") && !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Réseaux d'artisans"
        subtitle="Partagez une bibliothèque d'ouvrages avec votre groupement, votre réseau ou des confrères de confiance."
        back={{ href: "/app/catalogue", label: "Catalogue" }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Section title="Vos réseaux">
          {list.length ? (
            <ul className="divide-y divide-line text-sm" data-testid="reseaux">
              {list.map((n) => (
                <li key={n.id} className="flex flex-wrap justify-between gap-2 py-3">
                  <span className="min-w-0">
                    <Link href={`/app/catalogue/reseaux/${n.id}`} className="link font-medium">
                      {n.name}
                    </Link>
                    {n.description ? <span className="block text-xs text-muted">{n.description}</span> : null}
                  </span>
                  <span className="text-right text-xs text-muted">
                    {n.members} membre{n.members > 1 ? "s" : ""}, {n.items} ouvrage{n.items > 1 ? "s" : ""}
                    {n.animator ? <span className="block">Vous animez ce réseau</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="team" title="Aucun réseau">
              Créez un réseau et transmettez son code à vos confrères, ou rejoignez celui de votre groupement.
            </Empty>
          )}
        </Section>
        {canManage ? (
          <aside className="h-fit space-y-4">
            <section className="card p-4">
              <h2 className="mb-2 font-semibold">Rejoindre un réseau</h2>
              <ActionForm action={networkJoinAction} className="space-y-2">
                <label className="label" htmlFor="net-code">
                  Code d&apos;invitation
                </label>
                <input id="net-code" name="code" className="field uppercase" placeholder="ABCD-EFGH" autoComplete="off" required />
                <Submit className="btn-primary">Rejoindre</Submit>
              </ActionForm>
            </section>
            <section className="card p-4">
              <h2 className="mb-2 font-semibold">Créer un réseau</h2>
              <ActionForm action={networkCreateAction} className="space-y-2">
                <label className="label" htmlFor="net-name">
                  Nom du réseau
                </label>
                <input id="net-name" name="name" className="field" placeholder="Ex. Groupement des carreleurs du Rhône" required />
                <label className="label" htmlFor="net-desc">
                  Description
                </label>
                <textarea id="net-desc" name="description" rows={2} className="field" />
                <Submit className="btn-secondary">Créer</Submit>
              </ActionForm>
            </section>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
