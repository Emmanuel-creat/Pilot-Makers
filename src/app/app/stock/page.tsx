import Link from "next/link";
import { archiveStockItemAction, stockItemAction, stockMoveAction, stockSettingsAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { Empty, PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { listJobs } from "@/lib/services/jobs";
import { getStock } from "@/lib/services/stock";
import { DEPOT, MOVE_KINDS } from "@/lib/stock";

export const metadata = { title: "Stock" };

const qty = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });
const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function StockPage() {
  const ctx = await requirePageCtx();
  const [s, jobs, materials] = await Promise.all([
    getStock(ctx),
    listJobs(ctx),
    ctx.db.query<{ id: string; name: string }>(
      "SELECT id, name FROM catalog_items WHERE org_id=$1 AND active AND category <> 'main_oeuvre' ORDER BY favorite DESC, lower(name) LIMIT 300",
      [ctx.orgId],
    ),
  ]);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const openJobs = jobs.filter((j) => j.status === "a_planifier" || j.status === "en_cours");
  const locName = (id: string) => s.locations.find((l) => l.id === id)?.name ?? "Emplacement retiré";
  const itemName = (id: string) => s.items.find((i) => i.id === id)?.label ?? "";
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Stock"
        subtitle={`Dépôt${s.vehicles.length ? ` et ${s.vehicles.length} véhicule${s.vehicles.length > 1 ? "s" : ""}` : ""}${s.valueCents !== null ? `, valeur au coût d'achat : ${formatEuros(s.valueCents)}` : ""}.`}
        actions={
          <Link href="/app/parc" className="btn-secondary">
            <Icon name="truck" size={16} /> Véhicules
          </Link>
        }
      />
      <div className="space-y-6">
        {s.reorder.length || s.refill.length ? (
          <div className="grid gap-6 md:grid-cols-2">
            {s.reorder.length ? (
              <Section title="À commander" description="Articles du dépôt au seuil de réapprovisionnement ou en dessous.">
                <ul className="divide-y divide-line text-sm" data-testid="a-commander">
                  {s.reorder.map((r) => (
                    <li key={r.item.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        <span className="font-medium">{r.item.label}</span>
                        <span className="block text-xs text-muted">
                          {qty(r.have)} {r.item.unit} au dépôt, seuil {qty(r.item.minQty)}
                          {r.item.supplier ? `, ${r.item.supplier}` : ""}
                        </span>
                      </span>
                      <span className="tabular text-right">
                        Commander {qty(r.order)} {r.item.unit}
                        {r.costCents !== null ? <span className="block text-xs text-muted">{formatEuros(r.costCents)} HT</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            {s.refill.length ? (
              <Section title="À recharger dans les véhicules" description="Écart entre la dotation de chaque véhicule et ce qu'il contient.">
                <ul className="divide-y divide-line text-sm">
                  {s.refill.map((r) => (
                    <li key={`${r.itemId}-${r.vehicleId}`} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        <span className="font-medium">{locName(r.vehicleId)}</span> : {itemName(r.itemId)}
                      </span>
                      <span className="tabular">
                        manque {qty(r.missing)}
                        {r.fromDepot < r.missing ? `, ${qty(r.fromDepot)} au dépôt` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
        ) : null}

        <Section title="Articles suivis">
          {s.items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Article</th>
                    {s.locations.map((l) => (
                      <th key={l.id} className="py-2 pr-3 text-right font-medium">
                        {l.name}
                      </th>
                    ))}
                    <th className="py-2 font-medium">
                      <span className="sr-only">Réglages</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {s.items.map((i) => (
                    <tr key={i.id} className="align-top">
                      <td className="py-2 pr-3">
                        <span className="font-medium">{i.label}</span>
                        <span className="block text-xs text-muted">
                          {i.unit}
                          {i.minQty ? `, seuil ${qty(i.minQty)}` : ""}
                        </span>
                      </td>
                      {s.locations.map((l) => (
                        <td
                          key={l.id}
                          className={`tabular py-2 pr-3 text-right ${l.id === DEPOT && i.minQty && s.qty(i.id, DEPOT) <= i.minQty ? "text-warning" : ""}`}
                        >
                          {qty(s.qty(i.id, l.id))}
                        </td>
                      ))}
                      <td className="py-2">
                        {canEdit ? (
                          <details>
                            <summary className="link inline-flex min-h-6 cursor-pointer items-center text-xs">Seuils</summary>
                            <ActionForm action={stockSettingsAction} className="mt-2 w-56 space-y-2">
                              <input type="hidden" name="itemId" value={i.id} />
                              <label className="label" htmlFor={`min-${i.id}`}>
                                Seuil au dépôt
                              </label>
                              <input id={`min-${i.id}`} name="minQty" inputMode="decimal" className="field" defaultValue={i.minQty || ""} />
                              <label className="label" htmlFor={`re-${i.id}`}>
                                Quantité à commander
                              </label>
                              <input id={`re-${i.id}`} name="reorderQty" inputMode="decimal" className="field" defaultValue={i.reorderQty || ""} />
                              {s.vehicles.map((v) => (
                                <div key={v.id}>
                                  <label className="label" htmlFor={`kit-${i.id}-${v.id}`}>
                                    Dotation {v.name}
                                  </label>
                                  <input
                                    id={`kit-${i.id}-${v.id}`}
                                    name={`kit_${v.id}`}
                                    inputMode="decimal"
                                    className="field"
                                    defaultValue={s.kits.find((k) => k.itemId === i.id && k.vehicleId === v.id)?.target ?? ""}
                                  />
                                </div>
                              ))}
                              <Submit className="btn-secondary">Enregistrer</Submit>
                            </ActionForm>
                            <form action={archiveStockItemAction} className="mt-2">
                              <input type="hidden" name="id" value={i.id} />
                              <button type="submit" className="link inline-flex min-h-6 items-center text-xs text-danger">
                                Ne plus suivre
                              </button>
                            </form>
                          </details>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty icon="box" title="Aucun article suivi">
              Ajoutez les fournitures que vous gardez au dépôt ou dans vos véhicules : colle, joints, visserie, consommables.
            </Empty>
          )}
        </Section>

        {canEdit ? (
          <div className="grid gap-6 md:grid-cols-2">
            {s.items.length ? (
              <Section title="Mouvement de stock" description="Une sortie vers un chantier ajoute son coût d'achat aux coûts du chantier.">
                <ActionForm action={stockMoveAction} className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="mv-kind">
                        Mouvement
                      </label>
                      <select id="mv-kind" name="kind" className="field" defaultValue="sortie">
                        {Object.entries(MOVE_KINDS).map(([k, l]) => (
                          <option key={k} value={k}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="mv-item">
                        Article
                      </label>
                      <select id="mv-item" name="itemId" className="field">
                        {s.items.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="mv-qty">
                        Quantité (ou quantité comptée)
                      </label>
                      <input id="mv-qty" name="qty" inputMode="decimal" className="field" required />
                    </div>
                    <div>
                      <label className="label" htmlFor="mv-job">
                        Chantier (sortie)
                      </label>
                      <select id="mv-job" name="jobId" className="field">
                        <option value="">Aucun</option>
                        {openJobs.map((j) => (
                          <option key={j.id} value={j.id}>
                            {j.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="mv-from">
                        Depuis (sortie, transfert)
                      </label>
                      <select id="mv-from" name="from" className="field" defaultValue={DEPOT}>
                        {s.locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="mv-to">
                        Vers (entrée, transfert, inventaire)
                      </label>
                      <select id="mv-to" name="to" className="field" defaultValue={DEPOT}>
                        {s.locations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="mv-note">
                      Note
                    </label>
                    <input id="mv-note" name="note" className="field" maxLength={200} placeholder="Ex. : bon de livraison 4521" />
                  </div>
                  <Submit>Enregistrer le mouvement</Submit>
                </ActionForm>
              </Section>
            ) : null}
            <Section title="Suivre un article">
              <ActionForm action={stockItemAction} resetOnSuccess className="space-y-3">
                <div>
                  <label className="label" htmlFor="st-cat">
                    Article du catalogue
                  </label>
                  <select id="st-cat" name="catalogItemId" className="field" defaultValue="">
                    <option value="">Article hors catalogue</option>
                    {materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="st-label">
                      Désignation (hors catalogue)
                    </label>
                    <input id="st-label" name="label" className="field" maxLength={200} />
                  </div>
                  <div>
                    <label className="label" htmlFor="st-unit">
                      Unité
                    </label>
                    <input id="st-unit" name="unit" className="field" maxLength={20} placeholder="u, sac, boîte" />
                  </div>
                  <div>
                    <label className="label" htmlFor="st-min">
                      Seuil de réapprovisionnement
                    </label>
                    <input id="st-min" name="minQty" inputMode="decimal" className="field" />
                  </div>
                  <div>
                    <label className="label" htmlFor="st-re">
                      Quantité à commander
                    </label>
                    <input id="st-re" name="reorderQty" inputMode="decimal" className="field" />
                  </div>
                </div>
                <Submit className="btn-secondary">Suivre en stock</Submit>
              </ActionForm>
            </Section>
          </div>
        ) : null}

        {s.moves.length ? (
          <Section title="Derniers mouvements">
            <ul className="divide-y divide-line text-sm">
              {s.moves.map((m) => (
                <li key={m.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{m.label}</span>
                    <span className="block text-xs text-muted">
                      {[when(m.at), MOVE_KINDS[m.kind], locName(m.location), m.jobTitle ? `chantier ${m.jobTitle}` : "", m.note, m.author]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </span>
                  <span className={`tabular ${m.qty < 0 ? "text-muted" : "text-success"}`}>
                    {m.qty > 0 ? "+" : ""}
                    {qty(m.qty)} {m.unit}
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
