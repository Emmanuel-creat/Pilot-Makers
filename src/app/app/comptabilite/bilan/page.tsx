import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { can, isReadOnlyMember } from "@/lib/services/context";
import { parisDate } from "@/lib/services/quotes";
import { yearEndPack } from "@/lib/services/year-end";
import { YEAR_END_CHECKS, completion } from "@/lib/year-end";
import { YearEndForm } from "./YearEndForm";

export const metadata = { title: "Préparation du bilan" };

export default async function YearEndPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const today = parisDate(new Date());
  // Avant mai, on prépare encore l'exercice précédent.
  const defaultYear = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) <= 4 ? 1 : 0);
  const sp = await searchParams;
  const asked = Number(sp.annee);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : defaultYear;
  const p = await yearEndPack(ctx, year);
  const amounts: Record<string, string> = {
    creances: formatEuros(p.receivablesCents),
    acomptes: formatEuros(p.deposits.cents),
    en_cours: formatEuros(p.backlogCents),
    retenues: formatEuros(p.retentionCents),
    stock: p.stockValueCents == null ? "" : formatEuros(p.stockValueCents),
    frais: formatEuros(p.expenses.cents),
  };
  const c = completion(p.checks);
  const readOnly = ctx.entitlements.readOnly || !!ctx.supportAccess || isReadOnlyMember(ctx);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Préparation du bilan"
        back={{ href: "/app/comptabilite", label: "Comptabilité" }}
        subtitle={`Exercice du ${fmtDate(p.from)} au ${fmtDate(p.to)} : les montants sont arrêtés au dernier jour de l'exercice.`}
        actions={
          <>
            <form className="flex items-end gap-2" action="/app/comptabilite/bilan">
              <div>
                <label className="label" htmlFor="ye-year">
                  Exercice
                </label>
                <input id="ye-year" name="annee" type="number" min={2000} max={2100} className="field w-28 tabular" defaultValue={year} />
              </div>
              <button className="btn-secondary">Afficher</button>
            </form>
            <a href={`/api/bilan?annee=${year}`} className="btn-secondary">
              <Icon name="download" size={16} /> Dossier pour l&apos;expert-comptable
            </a>
          </>
        }
      />
      <div className="space-y-6">
        <Section
          title={`Points de clôture : ${c.done} sur ${c.total}`}
          description={
            p.updatedAt
              ? `Dernière mise à jour le ${fmtDate(p.updatedAt, true)}.`
              : "Cochez chaque point une fois vérifié, et laissez un commentaire à votre expert-comptable."
          }
        >
          <YearEndForm
            year={year}
            readOnly={readOnly}
            rows={YEAR_END_CHECKS.map((k) => ({
              id: k.id,
              label: k.label,
              hint: k.hint,
              amount: amounts[k.id] ?? "",
              done: !!p.checks[k.id],
              note: p.notes[k.id] ?? "",
            }))}
          />
        </Section>
        <Section
          title="Factures non réglées au dernier jour"
          description={`${p.receivables.length} facture${p.receivables.length > 1 ? "s" : ""}, ${formatEuros(p.receivablesCents)} au total.`}
        >
          {p.receivables.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="creances-cloture">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1.5 font-normal">Facture</th>
                    <th className="py-1.5 font-normal">Client</th>
                    <th className="py-1.5 font-normal">Date</th>
                    <th className="py-1.5 text-right font-normal">Reste dû</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {p.receivables.map((r) => (
                    <tr key={r.number}>
                      <td className="py-1.5">{r.number}</td>
                      <td className="py-1.5">{r.customer}</td>
                      <td className="py-1.5">{fmtDate(r.issueDate)}</td>
                      <td className="py-1.5 text-right tabular">{formatEuros(r.balanceCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">Aucune facture en attente de règlement à cette date.</p>
          )}
        </Section>
        {p.backlog.length ? (
          <Section title="Travaux signés restant à facturer" description="Devis acceptés avant la clôture et pas encore soldés.">
            <ul className="divide-y divide-line text-sm">
              {p.backlog.map((b) => (
                <li key={b.number + b.title} className="flex justify-between gap-3 py-1.5">
                  <span className="min-w-0">
                    {b.number} {b.title}
                  </span>
                  <span className="tabular">{formatEuros(b.remainingCents)}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
        <p className="text-sm text-muted">Achats de chantier saisis sur l&apos;exercice : {formatEuros(p.purchasesHtCents)} HT.</p>
      </div>
    </div>
  );
}
