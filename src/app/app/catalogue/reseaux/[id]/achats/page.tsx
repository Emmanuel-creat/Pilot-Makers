import { groupPurchaseCloseAction, groupPurchaseCommitAction, groupPurchaseCreateAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { PURCHASE_STATUSES } from "@/lib/group-buying";
import { requirePageCtx } from "@/lib/server/session";
import { groupPurchases } from "@/lib/services/group-buying";

export const metadata = { title: "Achats groupés du réseau" };

const fr = (iso: string) => iso.split("-").reverse().join("/");

export default async function GroupBuyingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const b = await groupPurchases(ctx, id);
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Achats groupés"
        subtitle={`${b.name} : regroupez vos commandes chez un fournisseur pour atteindre ses paliers de prix dégressifs.`}
        back={{ href: `/app/catalogue/reseaux/${id}`, label: b.name }}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Section title="Achats en cours et récents">
          {b.purchases.length ? (
            <ul className="divide-y divide-border text-sm" data-testid="achats-groupes">
              {b.purchases.map((p) => (
                <li key={p.id} className="space-y-2 py-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">
                    {p.open ? `Engagements jusqu'au ${fr(p.deadline)}` : PURCHASE_STATUSES[p.status]}, organisé par {p.isOrganizer ? "vous" : p.organizer}
                  </p>
                  <p className="font-medium">
                    {p.title} chez {p.supplier}
                  </p>
                  <table className="text-xs">
                    <caption className="sr-only">Paliers de prix de {p.title}</caption>
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="pr-4 font-normal">À partir de</th>
                        <th className="font-normal">Prix unitaire HT</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      <tr className={p.unitCents === p.baseCents ? "font-semibold" : ""}>
                        <td className="pr-4">1 {p.unit}</td>
                        <td>{formatEuros(p.baseCents)}</td>
                      </tr>
                      {p.tiers.map((t) => (
                        <tr key={t.minQty} className={p.unitCents === t.priceCents ? "font-semibold" : ""}>
                          <td className="pr-4">
                            {t.minQty} {p.unit}
                          </td>
                          <td>{formatEuros(t.priceCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p>
                    {p.total} {p.unit} engagés par {p.participants} entreprise{p.participants > 1 ? "s" : ""}, prix {p.status === "close" ? "final" : "actuel"}{" "}
                    {formatEuros(p.unitCents)}.{p.next ? ` Encore ${p.next.missing} ${p.unit} pour passer à ${formatEuros(p.next.tier.priceCents)}.` : ""}
                  </p>
                  {p.mine ? (
                    <p className="text-muted">
                      Votre engagement : {p.mine} {p.unit}, soit {formatEuros(p.mine * p.unitCents)} HT
                      {p.mySavingCents > 0 ? `, ${formatEuros(p.mySavingCents)} d'économie` : ""}.
                    </p>
                  ) : null}
                  {p.open && writable ? (
                    <ActionForm action={groupPurchaseCommitAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={p.id} />
                      <div>
                        <label className="label" htmlFor={`qty-${p.id.slice(0, 8)}`}>
                          Ma quantité ({p.unit})
                        </label>
                        <input id={`qty-${p.id.slice(0, 8)}`} name="quantity" className="field w-32 tabular" inputMode="numeric" defaultValue={p.mine || ""} />
                      </div>
                      <Submit className="btn-secondary">{p.mine ? "Modifier" : "M'engager"}</Submit>
                    </ActionForm>
                  ) : null}
                  {p.isOrganizer && writable ? (
                    <div className="flex flex-wrap gap-2">
                      {p.status === "ouverte" ? (
                        <>
                          <ActionForm action={groupPurchaseCloseAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <Submit className="btn-primary">Clore au palier atteint</Submit>
                          </ActionForm>
                          <ActionForm action={groupPurchaseCloseAction}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="cancel" value="1" />
                            <Submit className="btn-secondary">Annuler</Submit>
                          </ActionForm>
                        </>
                      ) : null}
                      {p.participants ? (
                        <a className="btn-secondary" href={`/api/achats-groupes/${p.id}/export`}>
                          Récapitulatif pour le fournisseur (CSV)
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty icon="truck" title="Aucun achat groupé">
              Ouvrez le premier : indiquez le produit, le fournisseur et ses paliers de prix, les membres du réseau engagent leurs quantités.
            </Empty>
          )}
        </Section>
        {writable ? (
          <Section title="Ouvrir un achat groupé">
            <ActionForm action={groupPurchaseCreateAction} resetOnSuccess className="space-y-3">
              <input type="hidden" name="networkId" value={id} />
              <div>
                <label className="label" htmlFor="gp-title">
                  Produit
                </label>
                <input id="gp-title" name="title" className="field" maxLength={160} placeholder="Ex. : plaques de plâtre BA13" />
              </div>
              <div>
                <label className="label" htmlFor="gp-supplier">
                  Fournisseur
                </label>
                <input id="gp-supplier" name="supplier" className="field" maxLength={160} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="gp-unit">
                    Unité
                  </label>
                  <input id="gp-unit" name="unit" className="field" maxLength={20} placeholder="u, m², sac" />
                </div>
                <div>
                  <label className="label" htmlFor="gp-base">
                    Prix de base HT (€)
                  </label>
                  <input id="gp-base" name="basePrice" className="field tabular" inputMode="decimal" />
                </div>
              </div>
              <fieldset className="space-y-2">
                <legend className="label">Paliers dégressifs</legend>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="sr-only" htmlFor={`gp-q${i}`}>
                        Palier {i + 1} : quantité minimale
                      </label>
                      <input id={`gp-q${i}`} name={`tierQty${i}`} className="field tabular" inputMode="numeric" placeholder="À partir de" />
                    </div>
                    <div>
                      <label className="sr-only" htmlFor={`gp-p${i}`}>
                        Palier {i + 1} : prix unitaire HT
                      </label>
                      <input id={`gp-p${i}`} name={`tierPrice${i}`} className="field tabular" inputMode="decimal" placeholder="Prix HT" />
                    </div>
                  </div>
                ))}
              </fieldset>
              <div>
                <label className="label" htmlFor="gp-deadline">
                  Date limite des engagements
                </label>
                <input id="gp-deadline" name="deadline" type="date" className="field" />
              </div>
              <Submit className="btn-primary">Ouvrir l&apos;achat groupé</Submit>
            </ActionForm>
          </Section>
        ) : null}
      </div>
    </div>
  );
}
