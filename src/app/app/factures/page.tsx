import Link from "next/link";
import { Empty, PageHeader, Stat, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { INVOICE_KINDS, invoiceSummary, listInvoices } from "@/lib/services/invoices";
import { InvoiceBadge } from "@/components/InvoiceBadge";
import { can } from "@/lib/services/context";

export const metadata = { title: "Factures" };

const FILTERS: [string, string][] = [
  ["", "Toutes"],
  ["issued", "À encaisser"],
  ["overdue", "En retard"],
  ["partial", "Partiellement payées"],
  ["paid", "Payées"],
  ["credit", "Avoirs"],
];

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ statut?: string; q?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const [items, summary] = await Promise.all([listInvoices(ctx, { status: sp.statut || undefined, q: sp.q }), invoiceSummary(ctx)]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Factures"
        subtitle="Acomptes, factures de solde et avoirs, émis depuis les devis acceptés."
        actions={
          can(ctx, "billing") ? (
            <Link href="/app/banque" className="btn-secondary">
              Rapprochement bancaire
            </Link>
          ) : null
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Reste à encaisser" value={formatEuros(summary.toCollectCents)} hint={`${summary.openCount} facture(s)`} href="/app/factures?statut=issued" />
        <Stat label="En retard" value={formatEuros(summary.overdueCents)} hint={`${summary.overdueCount} facture(s)`} href="/app/factures?statut=overdue" />
        <Stat label="Factures émises" value={String(items.length)} hint="selon le filtre" />
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" role="search">
        <label className="sr-only" htmlFor="f-q">
          Rechercher
        </label>
        <input id="f-q" name="q" defaultValue={sp.q ?? ""} placeholder="Numéro, client, objet" className="field sm:max-w-xs" />
        <label className="sr-only" htmlFor="f-s">
          Statut
        </label>
        <select id="f-s" name="statut" defaultValue={sp.statut ?? ""} className="field sm:max-w-56">
          {FILTERS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <button className="btn-secondary">Filtrer</button>
      </form>
      {ctx.role !== "member" && can(ctx, "billing") && !ctx.supportAccess ? (
        <details className="card p-4 text-sm">
          <summary className="cursor-pointer font-medium">Export comptable (FEC)</summary>
          <form action="/api/exports/fec" method="get" className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div>
              <label className="label" htmlFor="fec-du">
                Du
              </label>
              <input id="fec-du" name="du" type="date" className="field" defaultValue={`${new Date().getFullYear()}-01-01`} required />
            </div>
            <div>
              <label className="label" htmlFor="fec-au">
                Au
              </label>
              <input id="fec-au" name="au" type="date" className="field" defaultValue={`${new Date().getFullYear()}-12-31`} required />
            </div>
            <button className="btn-secondary">Télécharger le fichier des écritures</button>
          </form>
          <p className="mt-2 text-xs text-muted">
            Ventes, règlements et notes de frais au format officiel (18 colonnes, séparateur tabulation), à transmettre à votre expert-comptable. Autres formats dans Comptabilité.
          </p>
        </details>
      ) : null}
      {items.length === 0 ? (
        <Empty icon="euro" title="Aucune facture">
          Les factures se créent depuis un devis accepté : ouvrez-le et choisissez « Facturer l'acompte » ou « Facturer le solde ».
        </Empty>
      ) : (
        <div className="card overflow-x-auto">
          <ul className="divide-y divide-line sm:hidden">
            {items.map((i) => (
              <li key={i.id}>
                <Link href={`/app/factures/${i.id}`} className="block p-4">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium">{i.number}</span>
                    <span className="tabular font-medium">{formatEuros(i.amount_due_cents)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-sm text-muted">
                    <span className="truncate">{i.customer_name}</span>
                    <InvoiceBadge status={i.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm sm:table">
            <thead className="table-head border-b border-line">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Numéro</th>
                <th className="px-2 py-2 text-left font-medium">Type</th>
                <th className="px-2 py-2 text-left font-medium">Client</th>
                <th className="px-2 py-2 text-left font-medium">Date</th>
                <th className="px-2 py-2 text-left font-medium">Échéance</th>
                <th className="px-2 py-2 text-right font-medium">Montant TTC</th>
                <th className="px-2 py-2 text-right font-medium">Reste</th>
                <th className="px-4 py-2 text-left font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-surface-2">
                  <td className="px-4 py-2">
                    <Link href={`/app/factures/${i.id}`} className="font-medium hover:underline">
                      {i.number}
                    </Link>
                  </td>
                  <td className="px-2 py-2 text-muted">{INVOICE_KINDS[i.kind]}</td>
                  <td className="max-w-48 truncate px-2 py-2">{i.customer_name}</td>
                  <td className="px-2 py-2">{fmtDate(i.issue_date)}</td>
                  <td className="px-2 py-2">{i.kind === "credit_note" ? "" : fmtDate(i.due_date)}</td>
                  <td className="tabular px-2 py-2 text-right">{formatEuros(i.amount_due_cents)}</td>
                  <td className="tabular px-2 py-2 text-right">{i.kind === "credit_note" ? "" : formatEuros(Math.max(i.balance_cents, 0))}</td>
                  <td className="px-4 py-2">
                    <InvoiceBadge status={i.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
