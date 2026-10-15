import { notFound } from "next/navigation";
import { leftoverAddAction, leftoverDeleteAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Notice, PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { FATES, formatQuantity } from "@/lib/material-balance";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { jobMaterialBalance } from "@/lib/services/material-balance";

export const metadata = { title: "Bilan matière du chantier" };

const pct = (bp: number) => `${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;

/** Commandé, rendu, restes et réellement posé, matériau par matériau. */
export default async function JobMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  if (!can(ctx, "costs")) notFound();
  const b = await jobMaterialBalance(ctx, id);
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Bilan matière"
        subtitle={`${b.job.title} : ce qui a été commandé, rendu au fournisseur, laissé en reste et réellement posé.`}
        back={{ href: `/app/chantiers/${b.job.id}`, label: "Chantier" }}
      />
      {b.overOrdered.length ? (
        <Notice tone="warning" title="Commandes trop larges">
          Plus de 10 % de surplus sur : {b.overOrdered.join(", ")}. Au prochain chantier, réduisez la quantité commandée ou le taux de perte du catalogue.
        </Notice>
      ) : null}
      <Section title="Matériaux" description={b.rows.length ? `Restes : ${formatEuros(b.leftoverCents)}.` : undefined}>
        {b.rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="bilan-matiere">
              <thead>
                <tr className="table-head">
                  <th className="px-2 py-2">Matériau</th>
                  <th className="px-2 py-2 text-right">Reçu</th>
                  <th className="px-2 py-2 text-right">Rendu</th>
                  <th className="px-2 py-2 text-right">Reste</th>
                  <th className="px-2 py-2 text-right">Posé</th>
                  <th className="px-2 py-2 text-right">Surplus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {b.rows.map((r) => (
                  <tr key={r.key}>
                    <td className="px-2 py-2">
                      {r.label} <span className="text-muted">({r.unit})</span>
                    </td>
                    <td className="tabular px-2 py-2 text-right">{formatQuantity(r.receivedMilli)}</td>
                    <td className="tabular px-2 py-2 text-right">{formatQuantity(r.returnedMilli)}</td>
                    <td className="tabular px-2 py-2 text-right">{formatQuantity(r.leftoverMilli)}</td>
                    <td className="tabular px-2 py-2 text-right">{formatQuantity(r.usedMilli)}</td>
                    <td className={`tabular px-2 py-2 text-right ${r.surplusBp > 1000 ? "text-warning" : ""}`}>
                      {pct(r.surplusBp)}
                      {r.surplusCents ? `, ${formatEuros(r.surplusCents)}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Aucune commande ni aucun reste sur ce chantier.</p>
        )}
      </Section>
      <Section
        title="Noter un reste"
        description="En fin de chantier, notez ce qui reste et ce qu'il devient : gardé en stock, proposé au réemploi à un confrère, ou jeté."
      >
        <ActionForm action={leftoverAddAction} resetOnSuccess className="grid gap-3 sm:grid-cols-2">
          <input type="hidden" name="jobId" value={b.job.id} />
          <div className="sm:col-span-2">
            <label className="label" htmlFor="lo-line">
              Article commandé
            </label>
            <select id="lo-line" name="orderLineId" className="field" defaultValue="">
              <option value="">Autre matériau (à décrire)</option>
              {b.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label} ({l.unit})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="lo-label">
              Matériau, s&apos;il n&apos;est pas dans la liste
            </label>
            <input id="lo-label" name="label" className="field" maxLength={200} />
          </div>
          <div>
            <label className="label" htmlFor="lo-unit">
              Unité
            </label>
            <input id="lo-unit" name="unit" className="field" maxLength={20} placeholder="u, m², ml, sac" />
          </div>
          <div>
            <label className="label" htmlFor="lo-qty">
              Quantité restante
            </label>
            <input id="lo-qty" name="quantity" className="field" inputMode="decimal" required />
          </div>
          <div>
            <label className="label" htmlFor="lo-fate">
              Devenir
            </label>
            <select id="lo-fate" name="fate" className="field" defaultValue="stock">
              {Object.entries(FATES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Submit>Noter le reste</Submit>
          </div>
        </ActionForm>
        {b.leftovers.length ? (
          <ul className="mt-4 divide-y divide-line text-sm" data-testid="restes">
            {b.leftovers.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {formatQuantity(o.quantityMilli)} {o.unit} de {o.label} : {FATES[o.fate].toLowerCase()}
                </span>
                <ActionForm action={leftoverDeleteAction} className="shrink-0">
                  <input type="hidden" name="id" value={o.id} />
                  <Submit className="btn-ghost text-danger">Supprimer</Submit>
                </ActionForm>
              </li>
            ))}
          </ul>
        ) : null}
        {b.leftovers.some((o) => o.fate === "reemploi") ? (
          <p className="mt-3 text-sm text-muted">Publiez les restes proposés au réemploi dans la bourse de votre réseau, depuis Catalogue puis Réseaux.</p>
        ) : null}
      </Section>
    </div>
  );
}
