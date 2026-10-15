import Link from "next/link";
import { notFound } from "next/navigation";
import { chequeDepositAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section, fmtDate } from "@/components/ui";
import { chequeAge, chequeDeadline } from "@/lib/cheque-deposit";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { listDeposits, pendingCheques } from "@/lib/services/cheque-deposits";
import { can } from "@/lib/services/context";
import { parisDate } from "@/lib/services/quotes";

export const metadata = { title: "Remises de chèques" };

/** Chèques reçus à remettre en banque et bordereaux de remise. */
export default async function ChequeDepositsPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const [pending, deposits] = await Promise.all([pendingCheques(ctx), listDeposits(ctx)]);
  const today = parisDate(new Date());
  const total = pending.reduce((s, c) => s + c.amountCents, 0);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Remises de chèques"
        subtitle="Les chèques enregistrés sur vos factures, à remettre en banque avec un bordereau numéroté. Un chèque ne figure que sur un seul bordereau."
        back={{ href: "/app/factures", label: "Factures" }}
      />
      <Section title={`Chèques à remettre : ${pending.length}`} description={pending.length ? `Total ${formatEuros(total)}.` : undefined}>
        {pending.length ? (
          <ActionForm action={chequeDepositAction}>
            <ul className="divide-y divide-line" data-testid="cheques-a-remettre">
              {pending.map((c) => {
                const age = chequeAge(c.receivedOn, today);
                return (
                  <li key={c.id} className="py-2 text-sm">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" name="ids" value={c.id} defaultChecked className="mt-1" />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap justify-between gap-2">
                          <span className="font-medium">{c.drawer || "Client"}</span>
                          <span className="tabular font-medium">{formatEuros(c.amountCents)}</span>
                        </span>
                        <span className="block text-muted">
                          Facture {c.invoiceNumber}, reçu le {fmtDate(c.receivedOn)}
                          {c.reference ? `, ${c.reference}` : ""}
                        </span>
                        {age.level !== "ok" ? (
                          <span className={`block text-xs ${age.level === "urgent" ? "text-danger" : "text-warning"}`}>
                            {age.level === "urgent"
                              ? `À présenter avant le ${fmtDate(chequeDeadline(c.receivedOn))} environ, sinon la banque peut le refuser.`
                              : `Reçu il y a ${age.days} jours : pensez à le remettre.`}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="label" htmlFor="cd-date">
                  Date de remise
                </label>
                <input id="cd-date" name="depositedOn" type="date" className="field" defaultValue={today} max={today} />
              </div>
              <Submit>Établir le bordereau</Submit>
            </div>
          </ActionForm>
        ) : (
          <p className="text-sm text-muted">Aucun chèque à remettre. Enregistrez les chèques reçus depuis chaque facture, mode de paiement Chèque.</p>
        )}
      </Section>
      {deposits.length ? (
        <Section title="Bordereaux">
          <ul className="divide-y divide-line text-sm" data-testid="bordereaux">
            {deposits.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/app/factures/remises/${d.id}`} className="link">
                  Bordereau n° {d.number} du {fmtDate(d.depositedOn)}
                </Link>
                <span className="tabular text-muted">{d.count ? `${d.count} chèque${d.count > 1 ? "s" : ""}, ${formatEuros(d.totalCents)}` : "Annulé"}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : (
        <Empty icon="archive" title="Aucun bordereau pour l'instant" />
      )}
    </div>
  );
}
