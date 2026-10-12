import { Icon } from "@/components/Icon";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { num } from "@/lib/db";
import { requirePageCtx } from "@/lib/server/session";
import { getSubscription, listPlans, quotesIssuedThisMonth } from "@/lib/services/billing";
import { cancelSubscriptionAction } from "@/app/actions";
import { Checkout } from "./Checkout";

export const metadata = { title: "Abonnement" };

const STATUS: Record<string, string> = {
  trialing: "Essai gratuit",
  active: "Actif",
  past_due: "Paiement en échec",
  canceled: "Résilié",
  expired: "Expiré",
};

export default async function BillingPage() {
  const ctx = await requirePageCtx();
  const [plans, sub, used, invoices, aiUsed] = await Promise.all([
    listPlans(ctx.db),
    getSubscription(ctx.db, ctx.orgId),
    quotesIssuedThisMonth(ctx.db, ctx.orgId),
    ctx.db.query<{ id: string; number: string; plan_code: string; amount_ht_cents: unknown; amount_ttc_cents: unknown; status: string; created_at: Date }>(
      "SELECT * FROM billing_invoices WHERE org_id=$1 ORDER BY created_at DESC LIMIT 24",
      [ctx.orgId],
    ),
    ctx.db.query<{ n: unknown }>(
      "SELECT coalesce(sum(units),0) AS n FROM usage_events WHERE org_id=$1 AND kind='ai' AND created_at >= date_trunc('month', now())",
      [ctx.orgId],
    ),
  ]);
  const ent = ctx.entitlements;
  const owner = ctx.role === "owner" && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader title="Abonnement" subtitle="Sans engagement. Vos documents restent consultables et exportables, même sans abonnement payant." />
      <Notice tone="info" title="Paiement en mode démonstration">
        Les paiements passent par un simulateur : aucune carte n'est débitée. Le branchement d'un vrai prestataire de paiement nécessite un compte
        marchand. Carte de test acceptée : 4242 4242 4242 4242, carte refusée : 4000 0000 0000 0002.
      </Notice>
      <Section title="Votre offre">
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <div className="text-sm text-muted">Offre appliquée</div>
            <div className="text-lg font-semibold">{ent.plan.name}</div>
            <div className="text-xs text-muted">{STATUS[sub?.status ?? ""] ?? ""}</div>
          </div>
          <div>
            <div className="text-sm text-muted">{sub?.status === "trialing" ? "Fin de l'essai" : "Prochaine échéance"}</div>
            <div className="text-lg font-semibold">{fmtDate(sub?.status === "trialing" ? sub.trial_end : sub?.current_period_end) || "-"}</div>
            {sub?.cancel_at_period_end ? <div className="text-xs text-warning">Résiliation programmée</div> : null}
          </div>
          <div>
            <div className="text-sm text-muted">Devis émis ce mois</div>
            <div className="text-lg font-semibold">
              {used}
              {ent.plan.maxQuotesPerMonth ? ` / ${ent.plan.maxQuotesPerMonth}` : ""}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted">Assistant ce mois</div>
            <div className="text-lg font-semibold">
              {num(aiUsed[0]?.n)} / {ent.plan.aiQuotaMonth}
            </div>
          </div>
        </div>
        {sub?.payment_method_label ? <p className="mt-3 text-sm text-muted">Moyen de paiement : {sub.payment_method_label}</p> : null}
        {owner && sub && sub.status === "active" && sub.plan_code !== "decouverte" ? (
          <form action={cancelSubscriptionAction} className="mt-4">
            <input type="hidden" name="cancel" value={sub.cancel_at_period_end ? "0" : "1"} />
            <button className={sub.cancel_at_period_end ? "btn-secondary" : "btn-danger"}>
              {sub.cancel_at_period_end ? "Annuler la résiliation" : "Résilier à la fin de la période"}
            </button>
          </form>
        ) : null}
      </Section>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {plans.map((p) => {
          const current = sub?.plan_code === p.code && sub.status !== "trialing";
          return (
            <div key={p.code} className={`card flex flex-col p-5 ${current ? "border-accent ring-1 ring-accent" : ""}`}>
              <h3 className="font-semibold">{p.name}</h3>
              <p className="text-sm text-muted">{p.description}</p>
              <div className="mt-3 text-2xl font-semibold">
                {formatEuros(p.price_month_cents).replace(",00", "")}
                <span className="text-sm font-normal text-muted"> HT / mois</span>
              </div>
              {p.price_year_cents ? <div className="text-xs text-muted">ou {formatEuros(p.price_year_cents).replace(",00", "")} HT / an</div> : null}
              <ul className="mt-3 flex-1 space-y-1 text-sm">
                <li className="flex gap-2">
                  <Icon name="check" size={16} className="mt-0.5 text-success" />
                  {p.max_quotes_per_month ? `${p.max_quotes_per_month} devis / mois` : "Devis illimités"}
                </li>
                <li className="flex gap-2">
                  <Icon name="check" size={16} className="mt-0.5 text-success" />
                  {p.max_users} utilisateur(s)
                </li>
                {p.features.margin ? (
                  <li className="flex gap-2">
                    <Icon name="check" size={16} className="mt-0.5 text-success" />
                    Marge prévisionnelle
                  </li>
                ) : null}
                {p.features.reminders ? (
                  <li className="flex gap-2">
                    <Icon name="check" size={16} className="mt-0.5 text-success" />
                    Relances automatiques
                  </li>
                ) : null}
                {p.ai_quota_month ? (
                  <li className="flex gap-2">
                    <Icon name="check" size={16} className="mt-0.5 text-success" />
                    Assistant : {p.ai_quota_month} / mois
                  </li>
                ) : null}
              </ul>
              <div className="mt-4">
                {current ? (
                  <span className="text-sm font-medium text-accent">Offre actuelle</span>
                ) : owner ? (
                  <Checkout plan={p.code} name={p.name} free={p.price_month_cents === 0} monthly={p.price_month_cents} yearly={p.price_year_cents} />
                ) : (
                  <span className="text-xs text-muted">Seul le propriétaire peut changer d'offre</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Section title="Factures">
        {invoices.length === 0 ? (
          <p className="text-sm text-muted">Aucune facture pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="table-head">
                <th className="px-2 py-2">Numéro</th>
                <th className="px-2 py-2">Date</th>
                <th className="px-2 py-2">Offre</th>
                <th className="px-2 py-2 text-right">Montant TTC</th>
                <th className="px-2 py-2">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="px-2 py-2">{i.number}</td>
                  <td className="px-2 py-2">{fmtDate(i.created_at)}</td>
                  <td className="px-2 py-2">{i.plan_code}</td>
                  <td className="tabular px-2 py-2 text-right">{formatEuros(num(i.amount_ttc_cents))}</td>
                  <td className={`px-2 py-2 ${i.status === "paid" ? "text-success" : "text-danger"}`}>{i.status === "paid" ? "Payée" : i.status === "failed" ? "Échec" : "Remboursée"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  );
}
