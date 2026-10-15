import { notFound } from "next/navigation";
import { chequeDepositCancelAction } from "@/app/actions";
import { PrintButton } from "@/app/app/rapports/ReportActions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { PageHeader, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { getDeposit } from "@/lib/services/cheque-deposits";
import { can } from "@/lib/services/context";

export const metadata = { title: "Bordereau de remise de chèques" };

/** Bordereau imprimable, à joindre aux chèques déposés en banque. */
export default async function DepositSlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const d = await getDeposit(ctx, id);
  if (!d) notFound();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Bordereau de remise n° ${d.number}`}
        subtitle={`Remise du ${fmtDate(d.depositedOn)}.`}
        back={{ href: "/app/factures/remises", label: "Remises de chèques" }}
        actions={d.count ? <PrintButton /> : null}
      />
      <section className="card space-y-4 p-5 text-sm" data-testid="bordereau">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted">Titulaire du compte</dt>
            <dd className="font-medium">{d.holder || d.company}</dd>
          </div>
          <div>
            <dt className="text-muted">IBAN</dt>
            <dd className="font-mono">{d.iban || "À renseigner dans l'entreprise"}</dd>
          </div>
        </dl>
        {d.count ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="table-head">
                  <th className="px-2 py-2">Tireur</th>
                  <th className="px-2 py-2">Référence</th>
                  <th className="px-2 py-2">Facture</th>
                  <th className="px-2 py-2 text-right">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {d.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-2 py-2">{l.drawer}</td>
                    <td className="px-2 py-2">{l.reference}</td>
                    <td className="px-2 py-2">{l.invoiceNumber}</td>
                    <td className="tabular px-2 py-2 text-right">{formatEuros(l.amountCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-2 py-2" colSpan={3}>
                    {d.count} chèque{d.count > 1 ? "s" : ""}
                  </td>
                  <td className="tabular px-2 py-2 text-right">{formatEuros(d.totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="text-muted">Bordereau annulé : ses chèques sont revenus dans la liste à remettre.</p>
        )}
        <p className="pt-6 text-muted">Signature du remettant :</p>
      </section>
      {d.count ? (
        <ActionForm action={chequeDepositCancelAction} className="print:hidden">
          <input type="hidden" name="id" value={d.id} />
          <Submit className="btn-ghost text-danger">Annuler ce bordereau</Submit>
        </ActionForm>
      ) : null}
    </div>
  );
}
