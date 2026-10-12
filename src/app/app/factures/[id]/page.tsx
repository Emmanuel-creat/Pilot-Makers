import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { InvoiceBadge } from "@/components/InvoiceBadge";
import { retentionLabel } from "@/lib/services/btp";
import { SnapshotView } from "@/components/SnapshotView";
import { Notice, fmtDate } from "@/components/ui";
import { formatEuros, formatPercent, centsToInput } from "@/lib/calc/format";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import {
  defaultInvoiceMessage,
  getInvoice,
  INVOICE_KINDS,
  invoiceEmails,
  listInvoices,
  listPayments,
  PAYMENT_METHODS,
} from "@/lib/services/invoices";
import { getOrganization } from "@/lib/services/organization";
import { parisDate, frDate } from "@/lib/services/quotes";
import { cancelPaymentAction, clearScheduleAction } from "@/app/actions";
import { addMonths, INSTALLMENT_STATUSES, scheduleState } from "@/lib/services/schedule";
import { CreditNoteForm, PaymentForm, ScheduleForm, SendInvoiceForm } from "./InvoiceActions";

export const metadata = { title: "Facture" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const inv = await getInvoice(ctx, id).catch((e) => {
    if (e instanceof HttpError && e.status === 404) notFound();
    throw e;
  });
  const [payments, emails, org, related] = await Promise.all([
    listPayments(ctx, id),
    invoiceEmails(ctx, id),
    getOrganization(ctx),
    ctx.db.query<{ id: string; number: string; kind: string }>(
      "SELECT id, number, kind FROM invoices WHERE org_id=$1 AND (credited_invoice_id=$2 OR id=$3) AND id<>$2 ORDER BY issued_at",
      [ctx.orgId, id, inv.credited_invoice_id],
    ),
  ]);
  const s = inv.snapshot;
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const isCredit = inv.kind === "credit_note";
  const msg = defaultInvoiceMessage(inv, org);
  const afterTotals: [string, string, boolean][] = s.invoice.deductions.map((d) => [
    `Acompte ${d.number} du ${frDate(d.issueDate)}`,
    "-" + formatEuros(d.ttcCents),
    false,
  ]);
  if (s.invoice.retention?.cents) afterTotals.push([retentionLabel(s.invoice.retention.bp), "-" + formatEuros(s.invoice.retention.cents), false]);
  if (s.invoice.deductions.length || s.invoice.retention?.cents)
    afterTotals.push([isCredit ? "Net à rembourser ou à déduire" : "Net à payer", formatEuros(inv.amount_due_cents), true]);
  const vatOptions = [...new Set(s.calc.vatGroups.map((g) => formatPercent(g.vatBp, false)))];
  const today = parisDate(new Date());
  const installments = inv.schedule ? scheduleState(inv.schedule, inv.paid_cents + inv.credited_cents, today) : [];
  const lateInstallment = installments.find((x) => x.status === "overdue");
  const quoteLink = inv.quote_id ? (await listInvoices(ctx, { quoteId: inv.quote_id })).length : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/app/factures" className="mb-1 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <Icon name="left" size={16} /> Factures
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {INVOICE_KINDS[inv.kind]} {inv.number}
            </h1>
            <InvoiceBadge status={inv.status} />
          </div>
          <p className="mt-1 text-sm text-muted">
            {inv.title}
            {inv.quote_id && inv.quote_number ? (
              <>
                {" - devis "}
                <Link href={`/app/devis/${inv.quote_id}`} className="hover:underline">
                  {inv.quote_number}
                </Link>
                {quoteLink > 1 ? ` (${quoteLink} documents)` : ""}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noreferrer" className="btn-secondary">
            <Icon name="eye" size={16} /> PDF
          </a>
          <a href={`/api/invoices/${id}/pdf?download=1`} className="btn-secondary">
            <Icon name="download" size={16} /> Télécharger
          </a>
        </div>
      </div>

      {inv.status === "canceled" ? <Notice tone="info">Cette facture est entièrement annulée par avoir.</Notice> : null}
      {inv.status === "overdue" ? (
        <Notice tone="danger" title="Échéance dépassée">
          {lateInstallment ? `Échéance ${lateInstallment.index + 1} du ${fmtDate(lateInstallment.dueDate)} non réglée.` : `Échue le ${fmtDate(inv.due_date)}.`} {inv.reminder_count ? `${inv.reminder_count} relance(s) envoyée(s).` : "Aucune relance envoyée."}
        </Notice>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <SnapshotView
            s={s}
            heading={{
              title: `${INVOICE_KINDS[inv.kind]} ${inv.number}`,
              lines: [
                `Émise le ${frDate(inv.issue_date)}`,
                isCredit ? "" : `Échéance le ${frDate(inv.due_date)}`,
                s.invoice.creditedNumber ? `Sur la facture ${s.invoice.creditedNumber}` : "",
              ],
            }}
            afterTotals={afterTotals}
          />
        </div>
        <aside className="space-y-4">
          <section className="card space-y-2 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">{isCredit ? "Montant de l'avoir" : "Montant dû"}</span>
              <span className="tabular font-semibold">{formatEuros(inv.amount_due_cents)}</span>
            </div>
            {!isCredit ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted">Encaissé</span>
                  <span className="tabular">{formatEuros(inv.paid_cents)}</span>
                </div>
                {inv.credited_cents ? (
                  <div className="flex justify-between">
                    <span className="text-muted">Annulé par avoir</span>
                    <span className="tabular">{formatEuros(inv.credited_cents)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between border-t border-line pt-2">
                  <span className="font-medium">{inv.balance_cents < 0 ? "Trop-perçu à rembourser" : "Reste à payer"}</span>
                  <span className="tabular font-semibold">{formatEuros(Math.abs(inv.balance_cents))}</span>
                </div>
              </>
            ) : null}
            {related.length ? (
              <div className="border-t border-line pt-2 text-xs text-muted">
                {related.map((r) => (
                  <div key={r.id}>
                    <Link href={`/app/factures/${r.id}`} className="link">
                      {r.kind === "credit_note" ? "Avoir" : "Facture"} {r.number}
                    </Link>
                  </div>
                ))}
              </div>
            ) : null}
          </section>

          {!isCredit ? (
            <section className="card space-y-3 p-4">
              <h2 className="text-sm font-semibold">Paiements</h2>
              {payments.length ? (
                <ul className="divide-y divide-line text-sm">
                  {payments.map((p) => (
                    <li key={p.id} className={`flex items-start justify-between gap-2 py-2 ${p.canceled_at ? "text-muted line-through" : ""}`}>
                      <div>
                        <div className="tabular font-medium">{formatEuros(p.amount_cents)}</div>
                        <div className="text-xs text-muted">
                          {fmtDate(p.paid_on)}, {PAYMENT_METHODS[p.method]}
                          {p.reference ? `, ${p.reference}` : ""}
                        </div>
                      </div>
                      {!p.canceled_at && writable ? (
                        <form action={cancelPaymentAction}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="invoiceId" value={id} />
                          <button className="link text-xs text-danger">Annuler</button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">Aucun paiement enregistré.</p>
              )}
              {writable && inv.balance_cents > 0 ? (
                <PaymentForm
                  invoiceId={id}
                  balance={centsToInput(inv.balance_cents)}
                  today={parisDate(new Date())}
                  methods={Object.entries(PAYMENT_METHODS)}
                />
              ) : null}
            </section>
          ) : null}

          {installments.length ? (
            <section className="card space-y-3 p-4">
              <h2 className="text-sm font-semibold">Échéancier</h2>
              <ul className="divide-y divide-line text-sm">
                {installments.map((it) => (
                  <li key={it.index} className="flex items-start justify-between gap-2 py-2">
                    <div>
                      <div className="tabular font-medium">{formatEuros(it.amountCents)}</div>
                      <div className="text-xs text-muted">Le {fmtDate(it.dueDate)}</div>
                    </div>
                    <span className={`text-xs ${it.status === "overdue" ? "text-danger" : it.status === "paid" ? "text-success" : "text-muted"}`}>
                      {INSTALLMENT_STATUSES[it.status]}
                      {it.paidCents && it.status !== "paid" ? `, reste ${formatEuros(it.restCents)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {writable ? (
                <form action={clearScheduleAction}>
                  <input type="hidden" name="invoiceId" value={id} />
                  <button className="link text-xs text-danger">Supprimer l'échéancier</button>
                </form>
              ) : null}
            </section>
          ) : writable && !isCredit && inv.balance_cents >= 200 ? (
            <details className="card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Accorder un paiement en plusieurs fois</summary>
              <p className="mt-2 text-xs text-muted">
                La facture ne change pas : le reste à payer est réparti en échéances, rappelées dans l'e-mail d'envoi et relancées une à une.
              </p>
              <div className="mt-3">
                <ScheduleForm
                  invoiceId={id}
                  balance={inv.balance_cents}
                  min={inv.issue_date}
                  firstDate={inv.due_date > today ? inv.due_date : addMonths(today, 1)}
                />
              </div>
            </details>
          ) : null}

          {writable ? (
            <details className="card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Envoyer par e-mail</summary>
              <div className="mt-3">
                <SendInvoiceForm invoiceId={id} to={s.customer.email} subject={msg.subject} body={msg.body} />
              </div>
            </details>
          ) : null}

          {writable && !isCredit && inv.amount_due_cents > inv.credited_cents ? (
            <details className="card p-4">
              <summary className="cursor-pointer text-sm font-semibold">Corriger par un avoir</summary>
              <p className="mt-2 text-xs text-muted">Une facture émise ne se modifie pas : l'avoir l'annule en tout ou partie.</p>
              <div className="mt-3">
                <CreditNoteForm invoiceId={id} canFull={inv.credited_cents === 0} vatOptions={vatOptions.length ? vatOptions : ["20"]} />
              </div>
            </details>
          ) : null}

          {emails.length ? (
            <section className="card space-y-2 p-4">
              <h2 className="text-sm font-semibold">E-mails</h2>
              <ul className="space-y-2 text-xs">
                {emails.map((e) => (
                  <li key={e.id}>
                    <div className="font-medium">{e.subject}</div>
                    <div className="text-muted">
                      {fmtDate(e.created_at, true)} à {e.to_address} : {e.status === "sent" ? "envoyé" : e.status === "bounced" ? "rejeté" : "échec"}
                      {e.error ? ` (${e.error})` : ""}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="card p-4 text-sm">
            <h2 className="mb-1 font-medium">Formats structurés</h2>
            <p className="mb-3 text-xs text-muted">Pour la facturation électronique et les logiciels comptables (norme EN 16931).</p>
            <div className="flex flex-wrap gap-2">
              <a href={`/api/invoices/${id}/export?format=facturx`} className="btn-secondary">
                <Icon name="download" size={16} /> Factur-X
              </a>
              <a href={`/api/invoices/${id}/export?format=cii`} className="btn-secondary">
                <Icon name="download" size={16} /> XML CII
              </a>
              <a href={`/api/invoices/${id}/export?format=ubl`} className="btn-secondary">
                <Icon name="download" size={16} /> XML UBL
              </a>
            </div>
          </section>

          <section className="card p-4 text-xs text-muted">
            <div className="mb-1 font-medium text-ink">Intégrité</div>
            Empreinte SHA-256 du PDF : <span className="break-all font-mono">{inv.pdf_sha256}</span>
          </section>
        </aside>
      </div>
    </div>
  );
}
