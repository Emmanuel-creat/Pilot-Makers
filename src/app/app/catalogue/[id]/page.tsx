import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { ItemForm } from "@/components/ItemForm";
import { Notice, PageHeader, fmtDate } from "@/components/ui";
import { formatUnitPrice } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { getItem, itemToInput, priceHistory } from "@/lib/services/catalog";
import { listComponents } from "@/lib/services/ouvrages";
import { Composition } from "@/components/Composition";
import { duplicateItemAction } from "@/app/actions";

export const metadata = { title: "Prestation" };

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const it = await getItem(ctx, id).catch(() => notFound());
  const [history, components, usedIn] = await Promise.all([
    priceHistory(ctx, id),
    listComponents(ctx.db, ctx.orgId, id),
    ctx.db.query<{ id: string; name: string }>(
      "SELECT c.id, c.name FROM catalog_components k JOIN catalog_items c ON c.id=k.parent_id WHERE k.child_id=$1 AND k.org_id=$2 ORDER BY c.name",
      [id, ctx.orgId],
    ),
  ]);
  const input = itemToInput(it);
  return (
    <>
      <PageHeader
        title={it.name}
        subtitle={`${it.reference} - utilisée ${it.usage_count} fois${it.updated_by_name ? `, modifiée par ${it.updated_by_name}` : ""} le ${fmtDate(it.updated_at)}`}
        back={{ href: "/app/catalogue", label: "Catalogue" }}
        actions={
          <form action={duplicateItemAction}>
            <input type="hidden" name="id" value={it.id} />
            <button className="btn-secondary">
              <Icon name="copy" size={16} /> Dupliquer
            </button>
          </form>
        }
      />
      {it.source === "library" ? (
        <div className="mb-4">
          <Notice tone="warning">{it.source_note || "Tarif indicatif de la bibliothèque, à adapter."}</Notice>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card p-5">
          <ItemForm
            id={it.id}
            computed={it.kind === "ouvrage"}
            showCosts={ctx.role !== "member" || !!ctx.entitlements.plan.features.margin}
            initial={{
              reference: input.reference ?? "",
              name: input.name,
              description: input.description ?? "",
              category: input.category ?? "autre",
              subcategory: input.subcategory ?? "",
              unit: input.unit ?? "u",
              unit_cost: String(input.unit_cost ?? ""),
              hourly_cost: String(input.hourly_cost ?? ""),
              unit_price: String(input.unit_price ?? ""),
              vat_percent: String(input.vat_percent ?? "20"),
              supplier: input.supplier ?? "",
              duration_minutes: it.duration_minutes,
              price_valid_until: input.price_valid_until ?? null,
              active: input.active ?? true,
              favorite: input.favorite ?? false,
              tags: it.tags.join(", "),
            }}
          />
          <div className="mt-6 border-t border-line pt-5">
            <h2 className="mb-1 font-semibold">{it.kind === "ouvrage" ? "Composition de l'ouvrage" : "Ouvrage composé"}</h2>
            <p className="mb-3 text-sm text-muted">Quantités pour 1 {it.unit}. Sur le devis, l'ouvrage reste une seule ligne et sa composition est reprise dans la description.</p>
            <Composition
              itemId={it.id}
              unit={it.unit}
              initial={components}
              disabled={
                usedIn.length
                  ? `Cette prestation est un composant de : ${usedIn.map((u) => u.name).join(", ")}. Elle ne peut pas devenir un ouvrage.`
                  : undefined
              }
            />
          </div>
        </div>
        <aside className="card h-fit p-4">
          <h2 className="mb-2 text-sm font-semibold">Historique des prix</h2>
          {history.length === 0 ? <p className="text-sm text-muted">Aucune modification de prix.</p> : null}
          <ul className="space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i} className="border-l-2 border-line pl-3">
                <div className="tabular">
                  {h.old_price4 !== null ? formatUnitPrice(h.old_price4) : "-"} <Icon name="right" size={12} className="inline" />{" "}
                  {h.new_price4 !== null ? formatUnitPrice(h.new_price4) : "-"}
                </div>
                <div className="text-xs text-muted">
                  {fmtDate(h.created_at, true)}
                  {h.user_name ? ` par ${h.user_name}` : ""}
                </div>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </>
  );
}
