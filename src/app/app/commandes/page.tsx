import Link from "next/link";
import { notFound } from "next/navigation";
import { createOrderGroupAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { one } from "@/lib/db";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { draftsBySupplier, listGroups } from "@/lib/services/order-groups";

export const metadata = { title: "Commandes groupées" };

export default async function OrderGroupsPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "costs")) notFound();
  const [drafts, groups, org] = await Promise.all([
    draftsBySupplier(ctx),
    listGroups(ctx),
    one<{ address_line1: string; postal_code: string; city: string }>(ctx.db, "SELECT address_line1, postal_code, city FROM organizations WHERE id=$1", [
      ctx.orgId,
    ]),
  ]);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const depot = [org?.address_line1, [org?.postal_code, org?.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Commandes groupées"
        back={{ href: "/app/chantiers", label: "Chantiers" }}
        subtitle="Réunissez les commandes en brouillon de plusieurs chantiers chez un même fournisseur : un seul bon, une seule livraison."
      />
      <div className="space-y-6">
        {drafts.length ? (
          drafts.map((g, gi) => (
            <Section key={g.supplier} title={g.supplier} description={`${g.orders.length} commandes en brouillon à regrouper.`}>
              <ActionForm action={createOrderGroupAction} className="space-y-3">
                <fieldset disabled={!canEdit} className="space-y-3">
                  <legend className="sr-only">Commandes à regrouper chez {g.supplier}</legend>
                  <ul className="divide-y divide-line text-sm">
                    {g.orders.map((o) => (
                      <li key={o.id} className="py-2">
                        <label className="flex flex-wrap items-center justify-between gap-2">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" name="orderIds" value={o.id} className="h-4 w-4" defaultChecked={o.lines > 0} />
                            <span>
                              <span className="font-medium">{o.number}</span>, {o.jobTitle}
                              <span className="block text-xs text-muted">
                                {o.lines} ligne{o.lines > 1 ? "s" : ""}
                              </span>
                            </span>
                          </span>
                          <span className="tabular">{formatEuros(o.totalCents)} HT</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="label" htmlFor={`g-addr-${gi}`}>
                        Adresse de livraison
                      </label>
                      <input
                        id={`g-addr-${gi}`}
                        name="deliveryAddress"
                        className="field"
                        maxLength={300}
                        defaultValue={depot ? `Dépôt, ${depot}` : ""}
                        required
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor={`g-date-${gi}`}>
                        Livraison souhaitée
                      </label>
                      <input id={`g-date-${gi}`} name="deliveryDate" type="date" className="field" />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor={`g-notes-${gi}`}>
                      Remarques pour le fournisseur
                    </label>
                    <input id={`g-notes-${gi}`} name="notes" className="field" maxLength={2000} />
                  </div>
                  <Submit>Regrouper ces commandes</Submit>
                </fieldset>
              </ActionForm>
            </Section>
          ))
        ) : (
          <Empty icon="truck" title="Rien à regrouper pour l'instant">
            Dès que deux commandes en brouillon visent le même fournisseur, elles apparaissent ici. Les commandes se préparent depuis la fiche de chaque
            chantier.
          </Empty>
        )}
        {groups.length ? (
          <Section title="Commandes groupées">
            <ul className="divide-y divide-line text-sm" data-testid="groupes">
              {groups.map((g) => (
                <li key={g.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <Link className="link font-medium" href={`/app/commandes/${g.id}`}>
                    {g.number}, {g.supplier}
                  </Link>
                  <span className="text-muted">
                    {g.orders} commandes, {g.sentAt ? `envoyée le ${fmtDate(g.sentAt)}` : "à envoyer"}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </div>
  );
}
