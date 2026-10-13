import { PageHeader, Section, Stat } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { centsToInput, formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { getReport, monthLabel, type Breakdown } from "@/lib/services/reports";
import { GoalsForm, PrintButton } from "./ReportActions";
import { can } from "@/lib/services/context";

export const metadata = { title: "Rapports" };

const pct = (v: number | null) => (v === null ? "-" : `${String(v).replace(".", ",")} %`);
const daysLabel = (v: number | null) => (v === null ? "-" : `${String(v).replace(".", ",")} j`);

function Progress({ label, value, target, format }: { label: string; value: number; target: number; format: (n: number) => string }) {
  const ratio = target ? Math.min(100, Math.round((value * 100) / target)) : 0;
  return (
    <div>
      <div className="mb-1 flex justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className="tabular text-muted">
          {format(value)} sur {format(target)} ({ratio} %)
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-surface-2"
        role="progressbar"
        aria-label={label}
        aria-valuenow={ratio}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-2 rounded-full ${ratio >= 100 ? "bg-success" : "bg-accent"}`} style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

function BreakdownTable({ rows, caption }: { rows: Breakdown[]; caption: string }) {
  if (!rows.length) return <p className="text-sm text-muted">Aucun devis signé ou refusé sur la période.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-muted">
            <th className="py-2 font-medium">{caption}</th>
            <th className="py-2 text-right font-medium">Signés</th>
            <th className="py-2 text-right font-medium">Refusés</th>
            <th className="py-2 text-right font-medium">Taux</th>
            <th className="py-2 text-right font-medium">Signé HT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-line last:border-0">
              <td className="py-2">{r.label}</td>
              <td className="tabular py-2 text-right">{r.signed}</td>
              <td className="tabular py-2 text-right">{r.refused}</td>
              <td className="tabular py-2 text-right">{pct(r.rate)}</td>
              <td className="tabular py-2 text-right">{formatEuros(r.signedHtCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReportsPage() {
  const ctx = await requirePageCtx();
  const r = await getReport(ctx);
  const canEdit = can(ctx, "billing") && !ctx.entitlements.readOnly && !ctx.supportAccess;
  const max = Math.max(1, ...r.months.map((m) => Math.max(m.signedHtCents, m.invoicedHtCents, m.collectedCents)));
  const total = r.months.reduce(
    (t, m) => ({ signed: t.signed + m.signedHtCents, invoiced: t.invoiced + m.invoicedHtCents, collected: t.collected + m.collectedCents }),
    { signed: 0, invoiced: 0, collected: 0 },
  );
  return (
    <>
      <PageHeader
        title="Rapports"
        subtitle="Les 12 derniers mois. Un devis signé n'est pas encore un encaissement : chaque montant est présenté pour ce qu'il est."
        actions={
          <>
            <a href="/api/reports/csv" className="btn-secondary print:hidden">
              <Icon name="download" size={16} /> Tableur (CSV)
            </a>
            <PrintButton />
          </>
        }
      />
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Signé sur 12 mois (HT)" value={formatEuros(total.signed)} />
          <Stat label="En attente de réponse (TTC)" value={formatEuros(r.pendingTtcCents)} href="/app/devis" />
          <Stat label="Facturé sur 12 mois (HT)" value={formatEuros(total.invoiced)} href="/app/factures" />
          <Stat label="Encaissé sur 12 mois" value={formatEuros(total.collected)} />
        </div>

        <Section title="Objectifs du mois" description={monthLabel(r.currentMonth.month)}>
          {r.goals.monthlySignedHtCents || r.goals.monthlySent ? (
            <div className="space-y-4">
              {r.goals.monthlySignedHtCents ? (
                <Progress
                  label="Montant signé (HT)"
                  value={r.currentMonth.signedHtCents}
                  target={r.goals.monthlySignedHtCents}
                  format={(n) => formatEuros(n)}
                />
              ) : null}
              {r.goals.monthlySent ? (
                <Progress label="Devis envoyés" value={r.currentMonth.sent} target={r.goals.monthlySent} format={(n) => String(n)} />
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted">Aucun objectif fixé pour l'instant.</p>
          )}
          {canEdit ? (
            <details className="mt-4 print:hidden">
              <summary className="cursor-pointer text-sm font-medium">Fixer les objectifs mensuels</summary>
              <div className="mt-3">
                <GoalsForm
                  signed={r.goals.monthlySignedHtCents ? centsToInput(r.goals.monthlySignedHtCents) : ""}
                  sent={r.goals.monthlySent ? String(r.goals.monthlySent) : ""}
                />
              </div>
            </details>
          ) : null}
        </Section>

        <Section
          title="Mois par mois"
          description="Signé à la date d'acceptation, facturé à la date de la facture (avoirs déduits), encaissé à la date du paiement."
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Indicateurs mensuels</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 font-medium">Mois</th>
                  <th className="py-2 text-right font-medium">Envoyés</th>
                  <th className="py-2 text-right font-medium">Signés</th>
                  <th className="py-2 text-right font-medium">Taux</th>
                  <th className="py-2 text-right font-medium">Panier moyen HT</th>
                  <th className="py-2 pl-4 font-medium">Signé, facturé, encaissé</th>
                </tr>
              </thead>
              <tbody>
                {r.months.map((m) => (
                  <tr key={m.month} className="border-b border-line last:border-0">
                    <td className="py-2 whitespace-nowrap">{monthLabel(m.month)}</td>
                    <td className="tabular py-2 text-right">{m.sent}</td>
                    <td className="tabular py-2 text-right">{m.signed}</td>
                    <td className="tabular py-2 text-right">{pct(m.signatureRate)}</td>
                    <td className="tabular py-2 text-right">{m.averageBasketHtCents === null ? "-" : formatEuros(m.averageBasketHtCents)}</td>
                    <td className="py-2 pl-4">
                      <div
                        className="space-y-0.5"
                        title={`Signé ${formatEuros(m.signedHtCents)}, facturé ${formatEuros(m.invoicedHtCents)}, encaissé ${formatEuros(m.collectedCents)}`}
                      >
                        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(m.signedHtCents * 100) / max}%` }} />
                        <div className="h-1.5 rounded-full bg-warning" style={{ width: `${(Math.max(0, m.invoicedHtCents) * 100) / max}%` }} />
                        <div className="h-1.5 rounded-full bg-success" style={{ width: `${(m.collectedCents * 100) / max}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-accent" /> Signé HT
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-warning" /> Facturé HT
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-4 rounded-full bg-success" /> Encaissé
            </span>
          </p>
        </Section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Délais moyens">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">De la demande au devis émis</dt>
                <dd className="tabular">
                  {daysLabel(r.delays.leadToQuoteDays)} <span className="text-xs text-muted">({r.delays.samples.leadToQuote} demandes)</span>
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">De l'envoi à la signature</dt>
                <dd className="tabular">
                  {daysLabel(r.delays.quoteToSignatureDays)} <span className="text-xs text-muted">({r.delays.samples.quoteToSignature} devis)</span>
                </dd>
              </div>
            </dl>
          </Section>
          <Section title="Panier moyen" description="Devis signés des 3 derniers mois, comparés aux 3 mois précédents.">
            <p className="tabular text-2xl font-semibold">{r.basket.currentHtCents === null ? "-" : formatEuros(r.basket.currentHtCents)} HT</p>
            <p className="mt-1 text-sm text-muted">
              {r.basket.changePercent === null
                ? "Pas assez de devis signés pour comparer."
                : `${r.basket.changePercent >= 0 ? "En hausse" : "En baisse"} de ${String(Math.abs(r.basket.changePercent)).replace(".", ",")} % (${formatEuros(r.basket.previousHtCents ?? 0)} HT avant).`}
            </p>
          </Section>
        </div>

        <Section title="Taux de signature par type de travaux" description="Type reconnu dans l'objet et la description du devis.">
          <BreakdownTable rows={r.byTrade} caption="Type de travaux" />
        </Section>
        <Section title="Taux de signature par auteur du devis">
          <BreakdownTable rows={r.byAuthor} caption="Auteur" />
        </Section>
      </div>
    </>
  );
}
