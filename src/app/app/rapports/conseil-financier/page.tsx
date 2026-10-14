import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, Notice, PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { financialAdvice } from "@/lib/services/financial-advice";

export const metadata = { title: "Conseil financier" };

const PRIORITY = { 1: "Urgent", 2: "Important", 3: "À surveiller" } as const;

export default async function FinancialAdvicePage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const a = await financialAdvice(ctx);
  const total = a.recommendations.reduce((s, r) => s + (r.impactCents ?? 0), 0);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Conseil financier"
        subtitle="Des recommandations calculées sur vos propres chiffres des douze derniers mois, classées par urgence."
        back={{ href: "/app/rapports", label: "Rapports" }}
      />
      <div className="space-y-6">
        {a.inputs.balanceCents === null ? (
          <Notice tone="info" title="Affinez le conseil">
            Renseignez votre solde bancaire et vos charges fixes dans la{" "}
            <Link className="link" href="/app/rapports/tresorerie">
              trésorerie
            </Link>{" "}
            pour savoir combien de mois votre réserve couvre.
          </Notice>
        ) : null}
        {a.recommendations.length ? (
          <Section title={total > 0 ? `${a.recommendations.length} pistes, jusqu'à ${formatEuros(total)} en jeu` : `${a.recommendations.length} pistes`}>
            <ol className="space-y-4" data-testid="conseils-financiers">
              {a.recommendations.map((r) => (
                <li key={r.key} className="rounded-lg border border-line p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-semibold">{r.title}</h2>
                    <span className={`text-xs font-medium ${r.priority === 1 ? "text-danger" : r.priority === 2 ? "text-warning" : "text-muted"}`}>
                      {PRIORITY[r.priority]}
                      {r.impactCents ? `, ${formatEuros(r.impactCents)}` : ""}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{r.finding}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
                    {r.actions.map((x) => (
                      <li key={x}>{x}</li>
                    ))}
                  </ul>
                  <Link className="link mt-2 inline-block text-sm" href={r.href}>
                    Passer à l&apos;action
                  </Link>
                </li>
              ))}
            </ol>
          </Section>
        ) : (
          <Empty icon="chart" title="Rien d'urgent">
            Vos indicateurs sont dans les bonnes zones. Revenez après vos prochaines factures.
          </Empty>
        )}
        {a.strengths.length ? (
          <Section title="Vos points forts">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {a.strengths.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Section>
        ) : null}
        <Notice tone="info">Ces montants sont des ordres de grandeur. Validez vos décisions avec votre expert-comptable.</Notice>
      </div>
    </div>
  );
}
