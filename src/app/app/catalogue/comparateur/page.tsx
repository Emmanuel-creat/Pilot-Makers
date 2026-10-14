import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeader, Section } from "@/components/ui";
import { formatScaled } from "@/lib/calc/decimal";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { compareSuppliers } from "@/lib/services/supplier-compare";
import { SwitchSupplier } from "./SwitchSupplier";

export const metadata = { title: "Comparateur de fournisseurs" };

const euros4 = (v: number) => formatEuros(Math.round(v / 100));
const pct = (bp: number) => `${bp > 0 ? "+" : ""}${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

export default async function SupplierComparePage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "costs")) notFound();
  const { items, suppliers, savingCents } = await compareSuppliers(ctx);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const cheaper = items.filter((i) => i.cheaper);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Comparateur de fournisseurs"
        back={{ href: "/app/catalogue/tarifs-fournisseurs", label: "Tarifs fournisseurs" }}
        subtitle={
          items.length
            ? `${cheaper.length} article${cheaper.length > 1 ? "s" : ""} moins cher${cheaper.length > 1 ? "s" : ""} ailleurs parmi ${suppliers} tarifs importés${savingCents ? `, ${formatEuros(savingCents)} HT d'économie estimée sur un an` : ""}.`
            : "Comparez vos prix d'achat d'un fournisseur à l'autre, produit par produit."
        }
      />
      {items.length ? (
        <Section
          title="Articles du catalogue"
          description="Même produit reconnu par son code EAN, sinon par sa désignation et son unité. L'économie annuelle reprend les quantités de vos devis acceptés sur douze mois."
        >
          <ul className="divide-y divide-line text-sm" data-testid="comparateur">
            {items.map((i) => (
              <li key={i.itemId} className="space-y-2 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link className="link font-medium" href={`/app/catalogue/${i.itemId}`}>
                      {i.name}
                    </Link>
                    <p className="text-xs text-muted">
                      {i.supplier || "Fournisseur non renseigné"}
                      {i.cost4 != null ? `, ${euros4(i.cost4)} HT / ${i.unit}` : ""}
                      {i.matchedBy === "libelle" ? ", rapproché par la désignation" : ""}
                    </p>
                  </div>
                  {i.savingCents ? (
                    <p className="text-right text-xs">
                      <span className="font-medium text-success">{formatEuros(i.savingCents)} HT par an</span>
                      <span className="block text-muted">
                        pour {formatScaled(BigInt(i.yearQuantityMilli), 3).replace(".", ",")} {i.unit} achetés
                      </span>
                    </p>
                  ) : null}
                </div>
                <ul className="space-y-1">
                  {i.offers.slice(0, 3).map((o, n) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface-2 px-3 py-1.5 text-xs">
                      <span className="min-w-0">
                        <span className="font-medium">{o.supplier}</span>, {o.reference}
                        {o.label ? <span className="text-muted">{`, ${o.label}`}</span> : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="tabular">
                          {euros4(o.net4)} HT
                          {o.gapBp != null ? <span className={o.gapBp < 0 ? "text-success" : "text-muted"}>{` (${pct(o.gapBp)})`}</span> : null}
                        </span>
                        {canEdit && n === 0 && i.cheaper ? <SwitchSupplier itemId={i.itemId} offerId={o.id} supplier={o.supplier} /> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Empty icon="compare" title="Rien à comparer pour l'instant">
          Importez les fichiers de prix d&apos;au moins deux fournisseurs : les mêmes produits sont alors rapprochés et comparés à vos prix d&apos;achat.
        </Empty>
      )}
    </div>
  );
}
