import { notFound } from "next/navigation";
import { financingDeleteAction, financingStatusAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { FINANCING_KINDS, FINANCING_STATUSES } from "@/lib/financing";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import { getFinancing } from "@/lib/services/financing";
import { FinancingForm } from "../FinancingForm";

export const metadata = { title: "Demande de financement" };

export default async function FinancingDetail({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePageCtx();
  const { id } = await params;
  let d;
  try {
    d = await getFinancing(ctx, id);
  } catch (e) {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const f = d.request;
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const missing = d.checks.filter((c) => !c.ok);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={f.label}
        subtitle={`${FINANCING_KINDS[f.kind]} sur ${f.months} mois, ${formatEuros(f.amountCents)} HT. ${FINANCING_STATUSES[f.status]}.`}
        back={{ href: "/app/parc/financement", label: "Financement d'équipement" }}
        actions={
          <a href={`/api/financement/${f.id}/pdf`} className="btn-primary" target="_blank" rel="noreferrer">
            <Icon name="download" size={16} /> Dossier PDF
          </a>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Section title="Simulation" description="Mensualités HT estimées avec le taux indiqué ; l'offre du financeur fait foi.">
            <p className="mb-3 text-sm" data-testid="mensualite">
              Mensualité retenue : <span className="font-semibold tabular">{formatEuros(d.chosen.monthlyCents)}</span> sur {f.months} mois, coût du financement{" "}
              {formatEuros(d.chosen.costCents)}.
              {d.burdenPct !== null ? ` Soit ${d.burdenPct.toLocaleString("fr-FR")} % du chiffre d'affaires mensuel moyen des 12 derniers mois.` : ""}
            </p>
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Durée</th>
                  <th className="py-2 pr-3 text-right font-medium">Mensualité</th>
                  <th className="py-2 pr-3 text-right font-medium">Total payé</th>
                  <th className="py-2 text-right font-medium">Coût</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.simulations.map((s) => (
                  <tr key={s.months} className={s.months === f.months ? "font-semibold" : ""}>
                    <td className="py-2 pr-3">{s.months} mois</td>
                    <td className="tabular py-2 pr-3 text-right">{formatEuros(s.monthlyCents)}</td>
                    <td className="tabular py-2 pr-3 text-right">{formatEuros(s.totalCents)}</td>
                    <td className="tabular py-2 text-right">{formatEuros(s.costCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
          {canEdit ? (
            <Section title="Modifier la demande">
              <FinancingForm f={f} />
            </Section>
          ) : null}
        </div>
        <aside className="h-fit space-y-4">
          <section className="card p-4 text-sm">
            <h2 className="mb-2 font-semibold">Dossier</h2>
            <ul className="space-y-1" data-testid="pieces">
              {d.checks.map((c) => (
                <li key={c.key} className="flex gap-2">
                  <Icon name={c.ok ? "star" : "alert"} size={16} className={`mt-0.5 ${c.ok ? "text-success" : "text-warning"}`} />
                  <span>
                    {c.label}
                    <span className="sr-only">{c.ok ? " : renseigné" : " : à compléter"}</span>
                  </span>
                </li>
              ))}
            </ul>
            {missing.length ? <p className="mt-2 text-xs text-muted">Complétez la fiche entreprise ou la demande avant l&apos;envoi.</p> : null}
            <p className="mt-3 text-xs text-muted">Joignez aussi vos deux derniers bilans et le devis du fournisseur.</p>
          </section>
          {canEdit ? (
            <section className="card p-4 text-sm">
              <h2 className="mb-2 font-semibold">Suivi</h2>
              <ActionForm action={financingStatusAction} className="space-y-2">
                <input type="hidden" name="id" value={f.id} />
                <label className="label" htmlFor="fi-status">
                  Statut
                </label>
                <select id="fi-status" name="status" className="field" defaultValue={f.status}>
                  {Object.entries(FINANCING_STATUSES).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
                <Submit className="btn-secondary">Mettre à jour</Submit>
              </ActionForm>
              <form action={financingDeleteAction} className="mt-3">
                <input type="hidden" name="id" value={f.id} />
                <button type="submit" className="link inline-flex min-h-6 items-center text-xs text-danger">
                  Supprimer la demande
                </button>
              </form>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
