import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { HttpError } from "@/lib/http";
import { requirePageCtx } from "@/lib/server/session";
import { getJob } from "@/lib/services/jobs";
import { getOrder, ORDER_STATUSES } from "@/lib/services/purchase-orders";
import { parisDate } from "@/lib/services/quotes";
import { listDeliveries, listReturns } from "@/lib/services/supplier-returns";
import { RETURN_REASONS, RETURN_STATUSES, returnableMilli } from "@/lib/supplier-returns";
import { formatScaled } from "@/lib/calc/decimal";
import { DeleteOrderLine, OrderInfoForm, OrderLineForm, OrderStatusButtons, ReceiveForm, SupplierInvoiceForm } from "../../OrderForms";
import { ReturnForm, ReturnSteps } from "../../ReturnForms";

export const metadata = { title: "Commande fournisseur" };

export default async function OrderPage({ params }: { params: Promise<{ id: string; orderId: string }> }) {
  const { id, orderId } = await params;
  const ctx = await requirePageCtx();
  const data = await getOrder(ctx, orderId).catch((e) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  const { order, lines } = data;
  if (order.job_id !== id) notFound();
  const { job } = await getJob(ctx, id);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const draft = order.status === "brouillon";
  const sent = order.status === "envoye" || order.status === "recu_partiel" || order.status === "recu";
  const ids = { jobId: id, orderId };
  const today = parisDate(new Date());
  const [deliveries, returns] = await Promise.all([listDeliveries(ctx, orderId), listReturns(ctx, orderId)]);
  const returned = new Map<string, number>();
  for (const r of returns) returned.set(r.lineId, (returned.get(r.lineId) ?? 0) + r.quantityMilli);
  const returnable = lines
    .map((l) => ({ id: l.id, label: l.label, unit: l.unit, milli: returnableMilli(l.received_milli, returned.get(l.id) ?? 0) }))
    .filter((l) => l.milli > 0)
    .map((l) => ({ ...l, returnable: formatScaled(BigInt(l.milli), 3) }));
  const qty = (milli: number) => formatScaled(BigInt(milli), 3).replace(".", ",");
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={`Commande ${order.number}`}
        back={{ href: `/app/chantiers/${id}`, label: job.title }}
        subtitle={`${ORDER_STATUSES[order.status]}${order.supplier ? `, ${order.supplier}` : ""}${order.sent_at ? `, envoyée le ${fmtDate(order.sent_at)}` : ""}`}
        actions={
          lines.length ? (
            <a className="btn-secondary" href={`/api/orders/${orderId}/pdf`} target="_blank" rel="noopener">
              <Icon name="download" size={16} /> Bon de commande (PDF)
            </a>
          ) : null
        }
      />
      <div className="space-y-6">
        <Section title="Lignes" description={draft ? "Ajustez les quantités et les prix avant l'envoi." : undefined}>
          {lines.length ? (
            draft && canEdit ? (
              <ul className="space-y-3">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <OrderLineForm ids={ids} line={l} />
                    </div>
                    <DeleteOrderLine ids={ids} lineId={l.id} label={l.label} />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Lignes de la commande">
                <table className="w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-3 py-2">Désignation</th>
                      <th className="px-3 py-2 text-right">Commandé</th>
                      <th className="px-3 py-2 text-right">Reçu</th>
                      <th className="px-3 py-2 text-right">Prix unit. HT</th>
                      <th className="px-3 py-2 text-right">Total HT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.id} className="border-b border-line last:border-0">
                        <td className="px-3 py-2">
                          {l.label}
                          {l.reference ? <span className="block text-xs text-muted">Réf. {l.reference}</span> : null}
                        </td>
                        <td className="tabular px-3 py-2 text-right">
                          {l.quantity.replace(".", ",")} {l.unit}
                        </td>
                        <td
                          className={`tabular px-3 py-2 text-right ${l.received_milli >= l.quantity_milli ? "text-success" : l.received_milli ? "text-warning" : ""}`}
                        >
                          {l.received.replace(".", ",")}
                        </td>
                        <td className="tabular px-3 py-2 text-right">{l.unit_cost_cents ? formatEuros(l.unit_cost_cents) : ""}</td>
                        <td className="tabular px-3 py-2 text-right">{l.unit_cost_cents ? formatEuros(l.total_cents) : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <p className="text-sm text-muted">Aucune ligne pour l'instant.</p>
          )}
          <p className="mt-3 text-right text-sm font-semibold">Total HT : {formatEuros(data.totalCents)}</p>
          {draft && canEdit ? (
            <div className="mt-4 border-t border-line pt-4">
              <h3 className="mb-2 text-sm font-semibold">Ajouter une ligne</h3>
              <OrderLineForm ids={ids} />
            </div>
          ) : null}
        </Section>

        {draft && canEdit ? (
          <Section title="Fournisseur et livraison">
            <OrderInfoForm ids={ids} order={order} />
          </Section>
        ) : null}

        {canEdit && (draft || order.status === "envoye") ? (
          <OrderStatusButtons ids={ids} canSend={draft} canCancel={draft || order.status === "envoye"} />
        ) : null}

        {sent ? (
          <Section title="Réception" description="Quantité reçue au total pour chaque ligne, toutes livraisons confondues.">
            {canEdit ? <ReceiveForm ids={ids} lines={lines} today={today} /> : null}
          </Section>
        ) : null}

        {deliveries.length ? (
          <Section title="Livraisons" description="Chaque réception saisie, avec son bon de livraison et les réserves notées.">
            <ul className="divide-y divide-line text-sm" data-testid="livraisons">
              {deliveries.map((d) => (
                <li key={d.id} className="space-y-1 py-2">
                  <p className="font-medium">
                    {fmtDate(d.deliveredOn)}
                    {d.noteNumber ? `, bon ${d.noteNumber}` : ""}
                  </p>
                  {d.lines.length ? (
                    <p className="text-muted">
                      {d.lines.map((l) => `${l.label} : ${l.quantityMilli > 0 ? "+" : ""}${qty(l.quantityMilli)} ${l.unit}`).join(", ")}
                    </p>
                  ) : null}
                  {d.issues ? (
                    <p className="flex items-center gap-1 text-warning">
                      <Icon name="alert" size={14} /> Réserves : {d.issues}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        {sent && (returns.length || returnable.length) ? (
          <Section
            title="Retours au fournisseur"
            description="Casse, erreur, défaut ou surplus : suivez la reprise puis l'avoir, déduit des achats du chantier."
          >
            {returns.length ? (
              <ul className="mb-4 divide-y divide-line text-sm" data-testid="retours">
                {returns.map((r) => (
                  <li key={r.id} className="space-y-2 py-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span>
                        <span className="font-medium">
                          {r.label}, {r.quantity.replace(".", ",")} {r.unit}
                        </span>
                        <span className="block text-xs text-muted">
                          {RETURN_REASONS[r.reason]}
                          {r.restockingBp ? `, frais de reprise ${r.restockingBp / 100} %` : ""}
                          {r.notes ? `, ${r.notes}` : ""}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="inline-flex rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium">{RETURN_STATUSES[r.status]}</span>
                        <span className="block text-xs text-muted tabular">
                          {r.creditCents != null ? `Avoir ${formatEuros(r.creditCents)}` : `Avoir attendu ${formatEuros(r.expectedCents)}`}
                        </span>
                      </span>
                    </div>
                    {canEdit && r.status !== "avoir_recu" ? (
                      <ReturnSteps id={r.id} label={r.label} status={r.status} today={today} expected={(r.expectedCents / 100).toFixed(2).replace(".", ",")} />
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
            {canEdit && returnable.length ? <ReturnForm ids={ids} lines={returnable} /> : null}
          </Section>
        ) : null}

        {sent ? (
          <Section title="Facture du fournisseur" description="Comparée à la marchandise reçue, puis ajoutée aux achats du chantier.">
            {data.invoices.length ? (
              <ul className="mb-4 divide-y divide-line text-sm">
                {data.invoices.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2 py-2">
                    <span>
                      {fmtDate(i.date)}
                      {i.reference ? ` · ${i.reference}` : ""}
                    </span>
                    <span className="tabular">{formatEuros(i.amountCents)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {data.matching === "conforme" ? (
              <div className="mb-4">
                <Notice tone="success" title="Facture conforme">
                  Facturé {formatEuros(data.invoicedCents)} pour {formatEuros(data.receivedCents)} de marchandise reçue.
                </Notice>
              </div>
            ) : data.matching === "ecart" ? (
              <div className="mb-4">
                <Notice tone="warning" title="Écart à vérifier">
                  Facturé {formatEuros(data.invoicedCents)} pour {formatEuros(data.receivedCents)} de marchandise reçue, soit{" "}
                  {formatEuros(Math.abs(data.gapCents))} {data.gapCents > 0 ? "de trop" : "de moins"}.
                </Notice>
              </div>
            ) : null}
            {canEdit ? <SupplierInvoiceForm ids={ids} today={today} /> : null}
          </Section>
        ) : null}
      </div>
    </div>
  );
}
