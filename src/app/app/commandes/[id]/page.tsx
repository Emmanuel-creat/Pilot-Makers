import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteOrderGroupAction, sendOrderGroupAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { HttpError } from "@/lib/http";
import { milliText } from "@/lib/order-groups";
import { requirePageCtx } from "@/lib/server/session";
import { getGroup } from "@/lib/services/order-groups";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/services/purchase-orders";

export const metadata = { title: "Commande groupée" };

export default async function OrderGroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePageCtx();
  const g = await getGroup(ctx, id).catch((e) => {
    if (e instanceof HttpError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  });
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title={`Commande groupée ${g.group.number}`}
        back={{ href: "/app/commandes", label: "Commandes groupées" }}
        subtitle={`${g.group.supplier}, livraison ${g.group.deliveryAddress}${g.group.deliveryDate ? ` le ${fmtDate(g.group.deliveryDate)}` : ""}${g.group.sentAt ? `. Envoyée le ${fmtDate(g.group.sentAt)}` : ""}.`}
        actions={
          <a className="btn-secondary" href={`/api/order-groups/${id}/pdf`} target="_blank" rel="noopener">
            <Icon name="download" size={16} /> Bon de commande (PDF)
          </a>
        }
      />
      <div className="space-y-6">
        <Section title="Articles" description="Quantités additionnées, avec la part de chaque chantier.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">Article</th>
                  <th className="py-2 pr-3 text-right font-medium">Quantité</th>
                  <th className="py-2 pr-3 text-right font-medium">Prix unitaire HT</th>
                  <th className="py-2 text-right font-medium">Total HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {g.lines.map((l, i) => (
                  <tr key={i} className="align-top">
                    <td className="py-2 pr-3">
                      {l.label}
                      {l.reference ? <span className="text-muted">{` (${l.reference})`}</span> : null}
                      {l.split.length > 1 ? (
                        <span className="block text-xs text-muted">{l.split.map((s) => `${milliText(s.quantityMilli)} pour ${s.jobTitle}`).join(", ")}</span>
                      ) : (
                        <span className="block text-xs text-muted">{l.split[0].jobTitle}</span>
                      )}
                    </td>
                    <td className="tabular py-2 pr-3 text-right whitespace-nowrap">
                      {milliText(l.quantityMilli)} {l.unit}
                    </td>
                    <td className="tabular py-2 pr-3 text-right">{l.unitCostCents ? formatEuros(l.unitCostCents) : "-"}</td>
                    <td className="tabular py-2 text-right">{l.unitCostCents ? formatEuros(l.totalCents) : "-"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-2 pr-3 text-right font-medium">
                    Total HT
                  </td>
                  <td className="tabular py-2 text-right font-semibold">{formatEuros(g.totalCents)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Section>
        <Section title="Commandes réunies" description="Chaque commande se réceptionne et se rapproche de la facture sur la fiche de son chantier.">
          <ul className="divide-y divide-line text-sm">
            {g.orders.map((o) => (
              <li key={o.id} className="flex flex-wrap justify-between gap-2 py-2">
                <Link className="link" href={`/app/chantiers/${o.jobId}/commandes/${o.id}`}>
                  {o.number}, {o.jobTitle}
                </Link>
                <span className="text-muted">{ORDER_STATUSES[o.status as OrderStatus] ?? o.status}</span>
              </li>
            ))}
          </ul>
        </Section>
        {canEdit && !g.group.sentAt ? (
          <div className="flex flex-wrap items-start gap-3">
            <ActionForm action={sendOrderGroupAction}>
              <input type="hidden" name="id" value={id} />
              <Submit>
                <Icon name="send" size={16} /> Marquer comme envoyée au fournisseur
              </Submit>
            </ActionForm>
            <form action={deleteOrderGroupAction}>
              <input type="hidden" name="id" value={id} />
              <button type="submit" className="btn-secondary">
                Dégrouper
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </div>
  );
}
