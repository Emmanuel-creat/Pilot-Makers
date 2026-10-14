import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { bpToInput, formatPercent } from "@/lib/calc/format";
import { one } from "@/lib/db";
import { STAGE_STATUSES } from "@/lib/payment-stages";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { listStages } from "@/lib/services/payment-stages";
import { InvoiceStage, PlanForm, SubmitStage } from "./StageForms";

export const metadata = { title: "Paiement par étapes" };

export default async function PaymentStagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const v = await listStages(ctx, id).catch(() => null);
  if (!v) notFound();
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const customer = v.quote.customer_id
    ? await one<{ email: string }>(ctx.db, "SELECT email FROM customers WHERE id=$1 AND org_id=$2", [v.quote.customer_id, ctx.orgId])
    : null;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Paiement par étapes"
        back={{ href: `/app/devis/${id}`, label: v.quote.number ?? "Devis" }}
        subtitle={`${v.quote.title} : chaque étape est validée par le client sur photos avant d'être facturée.`}
      />
      <div className="space-y-6">
        {v.quote.status !== "accepted" ? (
          <Notice tone="info">Les étapes de paiement se définissent une fois le devis accepté par le client.</Notice>
        ) : (
          <>
            {v.stages.length ? (
              <Section title="Étapes">
                <ol className="space-y-4" data-testid="etapes">
                  {v.stages.map((st) => (
                    <li key={st.id} className="rounded-lg border border-line p-4 text-sm">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-medium">
                          {st.position}. {st.label}
                        </p>
                        <p className="tabular text-muted">{formatPercent(st.cumulativeBp)} cumulé</p>
                      </div>
                      <p className="text-xs text-muted">
                        {STAGE_STATUSES[st.status]}
                        {st.submittedAt ? ` · soumise le ${fmtDate(st.submittedAt)}` : ""}
                        {st.decidedAt ? ` · décision le ${fmtDate(st.decidedAt)}` : ""}
                        {st.invoiceNumber ? ` · facture ${st.invoiceNumber}` : ""}
                      </p>
                      {st.photoIds.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {st.photoIds.map((ph, i) => (
                            <a key={ph} href={`/api/etapes/photo/${ph}`} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/etapes/photo/${ph}`}
                                alt={`Photo ${i + 1} de l'étape ${st.label}`}
                                className="h-20 w-20 rounded-md border border-line object-cover"
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                      {st.clientComment ? (
                        <p className="mt-2">
                          <span className="font-medium">Remarque du client :</span> {st.clientComment}
                        </p>
                      ) : null}
                      {writable && st.canSubmit ? <SubmitStage stageId={st.id} hasEmail={!!customer?.email} /> : null}
                      {writable && st.canInvoice ? <InvoiceStage stageId={st.id} final={st.cumulativeBp >= 10000} /> : null}
                      {st.invoiceId ? (
                        <Link className="link mt-2 inline-block" href={`/app/factures/${st.invoiceId}`}>
                          Voir la facture
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ol>
              </Section>
            ) : null}
            {v.editable && writable ? (
              <Section title={v.stages.length ? "Modifier le plan" : "Définir les étapes"}>
                <p className="mb-3 text-sm text-muted">
                  Indiquez l&apos;avancement cumulé atteint à chaque étape. La dernière atteint 100 % et déclenche la facture de solde. Le plan est figé dès la
                  première étape soumise au client.
                </p>
                <PlanForm quoteId={id} rows={v.stages.map((s) => ({ label: s.label, percent: bpToInput(s.cumulativeBp) }))} />
              </Section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
