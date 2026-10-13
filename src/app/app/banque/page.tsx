import Link from "next/link";
import { bankIgnoreAction, bankMatchAction, bankUnmatchAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Empty, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { describeAmount, listBankTransactions, reconciliationQueue } from "@/lib/services/bank";
import { can, isReadOnlyMember } from "@/lib/services/context";
import { BankImport } from "./BankImport";

export const metadata = { title: "Banque" };

export default async function BankPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Rapprochement bancaire" />
        <p className="card p-5 text-sm">Le rapprochement bancaire est réservé aux personnes qui gèrent la facturation.</p>
      </div>
    );
  }
  const readOnly = isReadOnlyMember(ctx);
  const [queue, recent] = await Promise.all([reconciliationQueue(ctx), listBankTransactions(ctx, { limit: 60 })]);
  const done = recent.filter((t) => t.status !== "a_rapprocher");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Rapprochement bancaire"
        back={{ href: "/app/factures", label: "Factures" }}
        subtitle="Importez le relevé de votre banque : les virements qui citent une facture sont enregistrés seuls, les autres vous sont proposés."
      />
      {!readOnly ? (
        <Section title="Importer un relevé">
          <BankImport />
          <p className="mt-2 text-xs text-muted">
            Depuis la banque en ligne, exportez les opérations au format OFX, CAMT.053 ou CSV. Une opération déjà importée n&apos;est jamais comptée deux fois.
          </p>
        </Section>
      ) : null}

      <Section title={`Encaissements à rapprocher (${queue.length})`}>
        {queue.length === 0 ? (
          <Empty icon="check" title="Rien à rapprocher" />
        ) : (
          <ul className="space-y-3">
            {queue.map((t) => (
              <li key={t.id} className="rounded-md border border-line p-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0 font-medium">{t.label || t.counterparty || "Opération sans libellé"}</span>
                  <span className="font-semibold text-success">{formatEuros(t.amountCents)}</span>
                </div>
                <p className="text-xs text-muted">
                  {fmtDate(t.bookedOn)}
                  {t.reference ? ` · ${t.reference}` : ""}
                </p>
                {t.candidates.length ? (
                  <ul className="mt-2 space-y-1">
                    {t.candidates.map((c) => (
                      <li key={c.invoiceId} className="flex flex-wrap items-center justify-between gap-2 rounded bg-surface-2 px-2 py-1">
                        <span>
                          <Link className="link" href={`/app/factures/${c.invoiceId}`}>
                            {c.number}
                          </Link>{" "}
                          {c.customer}, reste {formatEuros(c.balanceCents)}
                          <span className="block text-xs text-muted">{c.reasons.join(", ")}</span>
                        </span>
                        {!readOnly ? (
                          <ActionForm action={bankMatchAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="invoiceId" value={c.invoiceId} />
                            <Submit className="btn-secondary">Rapprocher de {c.number}</Submit>
                          </ActionForm>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted">Aucune facture en attente ne correspond.</p>
                )}
                {!readOnly ? (
                  <ActionForm action={bankIgnoreAction} className="mt-2">
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="ignore" value="1" />
                    <button className="btn-ghost min-h-8 px-2 text-xs">Mettre de côté (hors factures)</button>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Dernières opérations traitées">
        {done.length === 0 ? (
          <p className="text-sm text-muted">Aucune opération pour l&apos;instant.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {done.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{t.label || t.counterparty}</span>
                  <span className="text-xs text-muted">
                    {fmtDate(t.bookedOn)} ·{" "}
                    {t.status === "rapproche"
                      ? `rapprochée de ${t.invoiceNumber ?? "la facture"}${t.matchedBy === "auto" ? " automatiquement" : ""}`
                      : t.status === "ignore"
                        ? "mise de côté"
                        : "dépense"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className={t.amountCents < 0 ? "text-muted" : "text-success"}>{describeAmount(t.amountCents)}</span>
                  {!readOnly && t.status === "rapproche" ? (
                    <ActionForm action={bankUnmatchAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="btn-ghost min-h-8 px-2 text-xs">Défaire</button>
                    </ActionForm>
                  ) : null}
                  {!readOnly && t.status === "ignore" ? (
                    <ActionForm action={bankIgnoreAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="ignore" value="0" />
                      <button className="btn-ghost min-h-8 px-2 text-xs">Remettre</button>
                    </ActionForm>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
