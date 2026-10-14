import Link from "next/link";
import { barcodeAssignAction, stockMoveAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { lookupCode } from "@/lib/services/barcode";
import { DEPOT } from "@/lib/stock";
import { Scanner } from "./Scanner";

export const metadata = { title: "Scanner un article" };

const qty = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });

export default async function ScannerPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const ctx = await requirePageCtx();
  const sp = await searchParams;
  const r = sp.code ? await lookupCode(ctx, sp.code) : null;
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const found = r && (r.catalog.length || r.stock.length || r.prices.length);
  const [catalogItems, stockItems] =
    r && canEdit
      ? await Promise.all([
          ctx.db.query<{ id: string; name: string }>(
            "SELECT id, name FROM catalog_items WHERE org_id=$1 AND active AND category <> 'main_oeuvre' AND ean = '' ORDER BY favorite DESC, lower(name) LIMIT 300",
            [ctx.orgId],
          ),
          ctx.db.query<{ id: string; label: string }>(
            "SELECT id, label FROM stock_items WHERE org_id=$1 AND archived_at IS NULL AND ean = '' ORDER BY lower(label) LIMIT 300",
            [ctx.orgId],
          ),
        ])
      : [[], []];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Scanner un article"
        subtitle="Retrouvez un produit par son code-barres dans votre catalogue, votre stock et les tarifs de vos fournisseurs."
        back={{ href: "/app/stock", label: "Stock" }}
      />
      <div className="space-y-6">
        <Section title="Code à rechercher">
          <Scanner initial={r?.code ?? ""} />
        </Section>

        {r ? (
          <>
            <p className="text-sm" data-testid="code-lu">
              <span className="font-medium tabular">{r.code}</span> : {r.kind}
              {r.valid ? ", clé de contrôle correcte" : ""}.
            </p>
            {!found ? (
              <Section title="Aucun article trouvé">
                <p className="text-sm text-muted">Ce code n&apos;est rattaché à aucun article, ni présent dans les tarifs fournisseurs importés.</p>
              </Section>
            ) : null}

            {r.stock.length ? (
              <Section title="En stock" description="Enregistrez directement une entrée ou un inventaire au dépôt.">
                <ul className="divide-y divide-line text-sm" data-testid="scan-stock">
                  {r.stock.map((i) => (
                    <li key={i.id} className="space-y-2 py-3">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium">{i.label}</span>
                        <span className="tabular">
                          {qty(i.depot)} {i.unit} au dépôt
                        </span>
                      </div>
                      {canEdit ? (
                        <ActionForm action={stockMoveAction} className="flex flex-wrap items-end gap-2">
                          <input type="hidden" name="itemId" value={i.id} />
                          <input type="hidden" name="to" value={DEPOT} />
                          <div>
                            <label className="label" htmlFor={`k-${i.id}`}>
                              Mouvement
                            </label>
                            <select id={`k-${i.id}`} name="kind" className="field" defaultValue="entree">
                              <option value="entree">Entrée au dépôt</option>
                              <option value="inventaire">Inventaire au dépôt</option>
                            </select>
                          </div>
                          <div className="w-28">
                            <label className="label" htmlFor={`q-${i.id}`}>
                              Quantité
                            </label>
                            <input id={`q-${i.id}`} name="qty" inputMode="decimal" className="field" required />
                          </div>
                          <Submit className="btn-secondary">Enregistrer</Submit>
                        </ActionForm>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {r.catalog.length ? (
              <Section title="Dans le catalogue">
                <ul className="divide-y divide-line text-sm" data-testid="scan-catalogue">
                  {r.catalog.map((c) => (
                    <li key={c.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        <Link href={`/app/catalogue/${c.id}`} className="link font-medium">
                          {c.name}
                        </Link>
                        <span className="block text-xs text-muted">
                          {c.reference}
                          {c.supplier ? `, ${c.supplier}` : ""}
                        </span>
                      </span>
                      <span className="tabular text-right">
                        {formatEuros(c.priceCents)} HT / {c.unit}
                        {c.costCents !== null ? <span className="block text-xs text-muted">achat {formatEuros(c.costCents)} HT</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {r.prices.length ? (
              <Section title="Chez vos fournisseurs" description="Prix nets des tarifs importés, du moins cher au plus cher.">
                <ul className="divide-y divide-line text-sm" data-testid="scan-tarifs">
                  {r.prices.map((p) => (
                    <li key={`${p.supplier}-${p.reference}`} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        <span className="font-medium">{p.supplier}</span> : {p.label || p.reference}
                        <span className="block text-xs text-muted">Réf. {p.reference}</span>
                      </span>
                      <span className="tabular">
                        {formatEuros(p.netCents)} HT{p.unit ? ` / ${p.unit.toLowerCase()}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}

            {canEdit && (catalogItems.length || stockItems.length) ? (
              <Section title="Associer ce code à un article" description="Au prochain scan, l'article sera retrouvé directement.">
                <ActionForm action={barcodeAssignAction} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="code" value={r.code} />
                  <div className="min-w-0 flex-1">
                    <label className="label" htmlFor="assign-article">
                      Article
                    </label>
                    <select id="assign-article" name="article" className="field">
                      {stockItems.length ? (
                        <optgroup label="Stock">
                          {stockItems.map((i) => (
                            <option key={i.id} value={`stock:${i.id}`}>
                              {i.label}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {catalogItems.length ? (
                        <optgroup label="Catalogue">
                          {catalogItems.map((i) => (
                            <option key={i.id} value={`catalog:${i.id}`}>
                              {i.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                    </select>
                  </div>
                  <Submit className="btn-secondary">
                    <Icon name="pin" size={16} /> Associer
                  </Submit>
                </ActionForm>
              </Section>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}
