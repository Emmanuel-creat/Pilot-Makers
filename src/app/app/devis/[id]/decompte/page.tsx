import { notFound } from "next/navigation";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { ACCOUNT_STATUSES, invoiceContribution } from "@/lib/final-account";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { getFinalAccount } from "@/lib/services/final-account";
import { INVOICE_KINDS } from "@/lib/services/invoices";
import { PrintButton } from "@/app/app/rapports/ReportActions";
import { ContestForm, PenaltiesForm, StatusButton } from "./AccountForms";

export const metadata = { title: "Décompte général" };

function Row({ label, value, strong, sub }: { label: string; value: number; strong?: boolean; sub?: boolean }) {
  return (
    <tr className={strong ? "border-t border-line font-semibold" : ""}>
      <th scope="row" className={`py-1.5 text-left font-normal ${sub ? "pl-4 text-muted" : ""} ${strong ? "font-semibold" : ""}`}>
        {label}
      </th>
      <td className="py-1.5 text-right tabular">{formatEuros(value)}</td>
    </tr>
  );
}

export default async function FinalAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  let v;
  try {
    v = await getFinalAccount(ctx, id);
  } catch (e) {
    if ((e as { status?: number }).status === 409)
      return (
        <div className="mx-auto max-w-3xl">
          <PageHeader title="Décompte général" back={{ href: `/app/devis/${id}`, label: "Devis" }} />
          <Notice tone="info">{(e as Error).message}.</Notice>
        </div>
      );
    notFound();
  }
  const a = v.account;
  const writable = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Décompte général définitif"
        back={{ href: `/app/devis/${id}`, label: v.quote.number ?? "Devis" }}
        subtitle={`${v.quote.title} · ${v.quote.customerName}${v.quote.acceptedAt ? ` · marché accepté le ${fmtDate(v.quote.acceptedAt)}` : ""}`}
        actions={<PrintButton />}
      />
      <div className="space-y-6">
        <Notice tone={v.status === "accepte" ? "success" : v.status === "conteste" ? "warning" : "info"} title={ACCOUNT_STATUSES[v.status]}>
          {v.status === "projet"
            ? "Les montants suivent les factures et règlements en direct. À l'envoi, ils sont figés tels que transmis au client."
            : `Envoyé le ${fmtDate(v.sentAt)}${v.answeredAt ? `, réponse notée le ${fmtDate(v.answeredAt)}` : ""}.${v.answerNote ? ` Motif : ${v.answerNote}` : ""}`}
        </Notice>
        <Section title="Récapitulatif du marché">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="decompte-general">
              <tbody>
                <tr>
                  <th scope="row" className="py-1.5 text-left font-normal">
                    Marché initial {v.quote.number ? `(devis ${v.quote.number})` : ""}
                  </th>
                  <td className="py-1.5 text-right tabular">{formatEuros(a.contractTtcCents - v.amendments.reduce((t, x) => t + x.ttcCents, 0))}</td>
                </tr>
                {v.amendments.map((x) => (
                  <Row key={x.label} label={x.label} value={x.ttcCents} sub />
                ))}
                <Row label={`Montant du marché TTC (${formatEuros(a.contractHtCents)} HT)`} value={a.contractTtcCents} strong />
                <Row label="Travaux facturés TTC" value={a.invoicedTtcCents} />
                {a.gapTtcCents ? (
                  <Row
                    label={a.gapTtcCents > 0 ? "dont au-delà du marché (révision de prix)" : "dont travaux non facturés"}
                    value={Math.abs(a.gapTtcCents)}
                    sub
                  />
                ) : null}
                <Row label="Retenue de garantie conservée par le client" value={-a.retentionCents} />
                <Row label={`Pénalités${v.penaltiesNote ? ` (${v.penaltiesNote})` : ""}`} value={-a.penaltiesCents} />
                <Row label="Règlements reçus" value={-a.paidCents} />
                <Row
                  label={a.balanceCents >= 0 ? "Solde restant dû par le client" : "Trop-perçu à rembourser au client"}
                  value={Math.abs(a.balanceCents)}
                  strong
                />
              </tbody>
            </table>
          </div>
          {a.retentionCents ? (
            <p className="mt-3 text-sm text-muted">
              La retenue de garantie de {formatEuros(a.retentionCents)} est libérable un an après la réception, sauf réserves non levées.
            </p>
          ) : null}
        </Section>
        <Section title="Factures du marché">
          {v.invoices.length === 0 ? (
            <p className="text-sm text-muted">Aucune facture émise.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1.5 font-normal">Facture</th>
                    <th className="py-1.5 font-normal">Date</th>
                    <th className="py-1.5 text-right font-normal">Au marché</th>
                    <th className="py-1.5 text-right font-normal">Réglé</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {v.invoices.map((i) => (
                    <tr key={i.number}>
                      <td className="py-1.5">
                        {INVOICE_KINDS[i.kind]} {i.number}
                      </td>
                      <td className="py-1.5">{fmtDate(i.issueDate)}</td>
                      <td className="py-1.5 text-right tabular">{formatEuros(invoiceContribution(i))}</td>
                      <td className="py-1.5 text-right tabular">{formatEuros(i.paidCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        {writable ? (
          <Section
            title="Établir le décompte"
            description="Le décompte se transmet au client une fois la facture de solde émise. Son acceptation clôt les comptes du marché."
          >
            <div className="space-y-4 print:hidden">
              {v.status === "projet" ? (
                <>
                  <PenaltiesForm quoteId={id} amount={a.penaltiesCents ? String(a.penaltiesCents / 100).replace(".", ",") : ""} note={v.penaltiesNote} />
                  <StatusButton quoteId={id} status="envoye" label="Figer et marquer comme envoyé" primary />
                </>
              ) : null}
              {v.status === "envoye" ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <StatusButton quoteId={id} status="accepte" label="Le client l'a accepté" primary />
                    <StatusButton quoteId={id} status="projet" label="Repasser en projet" />
                  </div>
                  <ContestForm quoteId={id} />
                </>
              ) : null}
              {v.status === "conteste" ? <StatusButton quoteId={id} status="projet" label="Reprendre le décompte" /> : null}
              {v.status === "accepte" ? <p className="text-sm text-muted">Décompte accepté : les comptes du marché sont clos.</p> : null}
            </div>
          </Section>
        ) : null}
      </div>
    </div>
  );
}
