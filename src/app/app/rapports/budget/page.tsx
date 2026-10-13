import Link from "next/link";
import { PageHeader, Section } from "@/components/ui";
import { centsToInput, formatEuros } from "@/lib/calc/format";
import { BUDGET_KEYS, BUDGET_LINES, cumulativeBudget, gap, monthlyBudget, projection, type Gap } from "@/lib/budget";
import { requirePageCtx } from "@/lib/server/session";
import { budgetActuals, getBudget } from "@/lib/services/budget";
import { parisDate } from "@/lib/services/quotes";
import { BudgetForm } from "./BudgetForm";

export const metadata = { title: "Budget" };

const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
const GAP_TONE: Record<Gap, string> = { favorable: "text-success", defavorable: "text-danger", neutre: "text-muted" };
const GAP_TEXT: Record<Gap, string> = { favorable: "favorable", defavorable: "défavorable", neutre: "conforme" };

export default async function BudgetPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const today = parisDate(new Date());
  const current = Number(today.slice(0, 4));
  const year = /^\d{4}$/.test(sp.annee ?? "") && Math.abs(Number(sp.annee) - current) <= 10 ? Number(sp.annee) : current;
  const [budget, actuals] = await Promise.all([getBudget(ctx, year), budgetActuals(ctx, year)]);
  const elapsed = year < current ? 12 : year > current ? 0 : Number(today.slice(5, 7));
  const sum = (a: number[], n: number) => a.slice(0, n).reduce((s, v) => s + v, 0);
  const hasBudget = BUDGET_KEYS.some((k) => budget[k]);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={`Budget ${year}`}
        subtitle="Vos objectifs de l'année comparés au réalisé : factures, encaissements, achats de chantier et notes de frais."
        back={{ href: "/app/rapports", label: "Rapports" }}
        actions={
          <>
            <Link className="btn-secondary" href={`/app/rapports/budget?annee=${year - 1}`}>
              {year - 1}
            </Link>
            <Link className="btn-secondary" href={`/app/rapports/budget?annee=${year + 1}`}>
              {year + 1}
            </Link>
          </>
        }
      />
      <Section
        title="Budget comparé au réalisé"
        description={elapsed ? `Cumul de janvier à ${MONTHS[elapsed - 1].toLowerCase()} ${year}, mois en cours compris.` : "Année pas encore commencée."}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Budget et réalisé par poste</caption>
            <thead>
              <tr className="text-left">
                <th scope="col" className="table-head py-2 pr-3">
                  Poste
                </th>
                <th scope="col" className="table-head py-2 pr-3 text-right">
                  Budget annuel
                </th>
                <th scope="col" className="table-head py-2 pr-3 text-right">
                  Budget à date
                </th>
                <th scope="col" className="table-head py-2 pr-3 text-right">
                  Réalisé à date
                </th>
                <th scope="col" className="table-head py-2 pr-3 text-right">
                  Écart
                </th>
                <th scope="col" className="table-head py-2 text-right">
                  Projection sur l&apos;année
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              {BUDGET_KEYS.map((k) => {
                const annual = budget[k] ?? 0;
                const planned = cumulativeBudget(annual, elapsed);
                const actual = sum(actuals[k], elapsed || 12);
                const g = gap(k, actual, planned);
                return (
                  <tr key={k} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-normal">
                      {BUDGET_LINES[k].label}
                    </th>
                    <td className="py-2 pr-3 text-right">{annual ? formatEuros(annual) : "-"}</td>
                    <td className="py-2 pr-3 text-right">{annual ? formatEuros(planned) : "-"}</td>
                    <td className="py-2 pr-3 text-right">{formatEuros(actual)}</td>
                    <td className={`py-2 pr-3 text-right ${GAP_TONE[g]}`}>
                      {annual ? `${actual - planned >= 0 ? "+" : ""}${formatEuros(actual - planned)} (${GAP_TEXT[g]})` : "-"}
                    </td>
                    <td className="py-2 text-right">{year === current && elapsed ? formatEuros(projection(actual, elapsed)) : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!hasBudget ? <p className="mt-3 text-sm text-muted">Aucun budget saisi pour {year} : indiquez vos objectifs ci-dessous.</p> : null}
      </Section>
      <Section title="Mois par mois" description="Réalisé de chaque mois, avec le douzième du budget annuel en dessous.">
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Réalisé mois par mois">
          <table className="w-full text-xs">
            <caption className="sr-only">Réalisé et budget mensuel par poste</caption>
            <thead>
              <tr>
                <th scope="col" className="table-head py-2 pr-3 text-left">
                  Poste
                </th>
                {MONTHS.map((m) => (
                  <th key={m} scope="col" className="table-head px-1 py-2 text-right">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {BUDGET_KEYS.map((k) => (
                <tr key={k} className="border-t border-line align-top">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                    {BUDGET_LINES[k].label}
                  </th>
                  {actuals[k].map((v, i) => (
                    <td key={i} className="px-1 py-1.5 text-right whitespace-nowrap">
                      {formatEuros(v, false)}
                      {budget[k] ? <div className="text-muted">{formatEuros(monthlyBudget(budget[k]!, i + 1), false)}</div> : null}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      {canEdit ? (
        <Section title={`Objectifs ${year}`} description="Montants annuels, répartis en douzièmes. Laissez vide un poste que vous ne suivez pas.">
          <BudgetForm
            year={year}
            lines={BUDGET_KEYS.map((k) => ({ key: k, label: BUDGET_LINES[k].label }))}
            values={Object.fromEntries(BUDGET_KEYS.filter((k) => budget[k]).map((k) => [k, centsToInput(budget[k]!)]))}
          />
        </Section>
      ) : null}
    </div>
  );
}
