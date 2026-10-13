import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { EXPENSE_CATEGORIES, EXPENSE_STATUSES, expenseTotals, listExpenses, PAYMENTS, pendingExpenses } from "@/lib/services/expenses";
import { parisDate } from "@/lib/services/quotes";
import { pointableJobs } from "@/lib/services/timesheets";
import { DeleteExpense, ExpenseForm, ExpenseReview } from "./ExpenseForms";
import { can } from "@/lib/services/context";

export const metadata = { title: "Notes de frais" };

const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const shiftMonth = (m: string, n: number) => {
  const d = new Date(`${m}-15T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ vue?: string; mois?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const admin = can(ctx, "staff");
  const team = admin && sp.vue === "equipe";
  const today = parisDate(new Date());
  const month = /^\d{4}-\d{2}$/.test(sp.mois ?? "") ? sp.mois! : today.slice(0, 7);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const [list, jobs, pending] = await Promise.all([listExpenses(ctx, { month, team }), pointableJobs(ctx, today), team ? pendingExpenses(ctx) : []]);
  const link = (m: string, vue = team ? "equipe" : "") => `/app/frais?${vue ? `vue=${vue}&` : ""}mois=${m}`;
  const totals = expenseTotals(list);
  const describe = (e: (typeof list)[number]) =>
    [fmtDate(e.expense_date), EXPENSE_CATEGORIES[e.category], e.job_title, PAYMENTS[e.payment], e.review_note ? `Refus : ${e.review_note}` : ""]
      .filter(Boolean)
      .join(" · ");
  const reviewRows = [...pending, ...list.filter((e) => e.status !== "soumis")].map((e) => ({
    id: e.id,
    label: `${e.user_name} : ${formatEuros(e.amount_ttc_cents)}${e.merchant ? `, ${e.merchant}` : ""}`,
    detail: describe(e),
    status: e.status,
    statusLabel: EXPENSE_STATUSES[e.status],
    photo: e.has_photo ? `/api/expenses/${e.id}/photo` : null,
  }));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Notes de frais"
        subtitle={`${monthLabel(month)}${team ? ", toute l'équipe" : ""}`}
        actions={
          <>
            <Link className="btn-secondary px-2" href={link(shiftMonth(month, -1))} aria-label="Mois précédent">
              <Icon name="left" size={16} />
            </Link>
            <Link className="btn-secondary px-2" href={link(shiftMonth(month, 1))} aria-label="Mois suivant">
              <Icon name="right" size={16} />
            </Link>
            {admin ? (
              <>
                <Link className={team ? "btn-secondary" : "btn-primary"} href={link(month, "")} aria-current={team ? undefined : "page"}>
                  Mes notes
                </Link>
                <Link className={team ? "btn-primary" : "btn-secondary"} href={link(month, "equipe")} aria-current={team ? "page" : undefined}>
                  Équipe
                </Link>
              </>
            ) : null}
          </>
        }
      />
      {team ? (
        <>
          <Section title="À valider et suivi du mois" description="Les notes en attente de tous les mois apparaissent en premier.">
            {reviewRows.length ? <ExpenseReview rows={reviewRows} /> : <p className="text-sm text-muted">Aucune note de frais.</p>}
          </Section>
          <Section title="Récapitulatif du mois">
            {totals.length ? (
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Récapitulatif des notes de frais">
                <table className="w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-3 py-2">Personne</th>
                      <th className="px-3 py-2 text-right">Dépensé</th>
                      <th className="px-3 py-2 text-right">Validé</th>
                      <th className="px-3 py-2 text-right">À rembourser</th>
                      <th className="px-3 py-2 text-right">Remboursé</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totals.map((t) => (
                      <tr key={t.name} className="border-b border-line last:border-0">
                        <td className="px-3 py-2">{t.name}</td>
                        <td className="tabular px-3 py-2 text-right">{formatEuros(t.totalCents)}</td>
                        <td className="tabular px-3 py-2 text-right">{formatEuros(t.validatedCents)}</td>
                        <td className="tabular px-3 py-2 text-right font-semibold">{formatEuros(t.toReimburseCents)}</td>
                        <td className="tabular px-3 py-2 text-right">{formatEuros(t.reimbursedCents)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">Rien ce mois-ci.</p>
            )}
            <a className="btn-secondary mt-4" href={`/api/expenses/export?mois=${month}`}>
              <Icon name="download" size={16} /> Export pour la comptabilité (CSV)
            </a>
          </Section>
        </>
      ) : (
        <>
          {canEdit ? (
            <Section title="Nouvelle note de frais" description="Photographiez le ticket : il est joint à la note.">
              <ExpenseForm jobs={jobs} categories={EXPENSE_CATEGORIES} today={today} />
            </Section>
          ) : null}
          <Section title="Mes notes du mois">
            {list.length ? (
              <ul className="divide-y divide-line text-sm">
                {list.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">
                        {formatEuros(e.amount_ttc_cents)}
                        {e.merchant ? `, ${e.merchant}` : ""}
                      </span>
                      <span className="block truncate text-xs text-muted">{describe(e)}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {e.has_photo ? (
                        <a className="link" href={`/api/expenses/${e.id}/photo`} target="_blank" rel="noopener">
                          Ticket
                        </a>
                      ) : null}
                      <span className={e.status === "refuse" ? "text-danger" : e.status === "soumis" ? "text-warning" : "text-success"}>
                        {EXPENSE_STATUSES[e.status]}
                      </span>
                      {canEdit && (e.status === "soumis" || e.status === "refuse") ? (
                        <DeleteExpense id={e.id} label={`la note de ${formatEuros(e.amount_ttc_cents)}`} />
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aucune note ce mois-ci.</p>
            )}
            {totals[0] ? (
              <p className="mt-3 text-sm">
                À vous rembourser : <span className="font-semibold">{formatEuros(totals[0].toReimburseCents)}</span>
              </p>
            ) : null}
          </Section>
        </>
      )}
    </div>
  );
}
