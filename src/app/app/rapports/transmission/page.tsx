import { notFound } from "next/navigation";
import { PrintButton } from "@/app/app/rapports/ReportActions";
import { Notice, PageHeader, Section } from "@/components/ui";
import { TRANSFER_STEPS } from "@/lib/business-transfer";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { transferFile } from "@/lib/services/business-transfer";
import { can } from "@/lib/services/context";

export const metadata = { title: "Transmission de l'entreprise" };

const pct = (v: number) => `${Math.round(v * 100)} %`;

export default async function TransferPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const { inputs: i, valuation: v, assets } = await transferFile(ctx);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Transmission de l'entreprise"
        subtitle="Votre historique rassemblé et valorisé pour préparer une cession : un point de départ pour l'expert-comptable et le repreneur."
        back={{ href: "/app/rapports", label: "Rapports" }}
        actions={<PrintButton />}
      />
      <div className="space-y-6">
        {v.insufficient ? (
          <Notice tone="info" title="Historique encore court">
            La valeur ci-dessous repose sur moins de deux exercices complets ou un chiffre d&apos;affaires faible : elle se précisera avec le temps.
          </Notice>
        ) : null}
        <Section title="Valeur indicative">
          <p className="text-2xl font-semibold" data-testid="valeur-transmission">
            {formatEuros(v.lowCents)} à {formatEuros(v.highCents)}
          </p>
          <p className="mt-1 text-sm text-muted">
            Croisement de deux méthodes usuelles pour une entreprise artisanale du bâtiment : trois fois l&apos;excédent moyen ({formatEuros(v.byMultipleCents)}
            ) et 40 % du chiffre d&apos;affaires moyen ({formatEuros(v.byRevenueCents)}), ajustés des points ci-dessous. Seul un expert peut établir une
            évaluation opposable.
          </p>
          {v.factors.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {v.factors.map((f) => (
                <li key={f.key} className={f.effect > 0 ? "text-success" : "text-danger"}>
                  {f.effect > 0 ? "+" : ""}
                  {f.effect} % : {f.label}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
        <Section title="Trois derniers exercices">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="py-1 pr-2 font-medium">Année</th>
                  <th className="px-2 py-1 text-right font-medium">Chiffre d&apos;affaires HT</th>
                  <th className="px-2 py-1 text-right font-medium">Achats et frais</th>
                  <th className="py-1 pl-2 text-right font-medium">Excédent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {i.years.map((y) => (
                  <tr key={y.year}>
                    <td className="py-1.5 pr-2">{y.year}</td>
                    <td className="tabular px-2 py-1.5 text-right">{formatEuros(y.revenueCents)}</td>
                    <td className="tabular px-2 py-1.5 text-right">{formatEuros(y.costsCents)}</td>
                    <td className="tabular py-1.5 pl-2 text-right">{formatEuros(y.revenueCents - y.costsCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">
            Achats de chantier et frais saisis dans l&apos;application ; salaires, loyers et charges sociales n&apos;y figurent pas : l&apos;excédent n&apos;est
            pas un résultat comptable.
            {v.growth !== null ? ` Évolution du chiffre d'affaires sur la période : ${v.growth >= 0 ? "+" : ""}${pct(v.growth)}.` : ""}
          </p>
        </Section>
        <Section title="Ce que reprend le repreneur">
          {assets.length ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {assets.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Votre historique est encore vide.</p>
          )}
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Clients qui reviennent</dt>
              <dd className="font-semibold">{i.repeatShare === null ? "Pas encore de donnée" : pct(i.repeatShare)}</dd>
            </div>
            <div>
              <dt className="text-muted">Part du premier client</dt>
              <dd className="font-semibold">{i.topCustomerShare === null ? "Pas encore de donnée" : pct(i.topCustomerShare)}</dd>
            </div>
            <div>
              <dt className="text-muted">Travaux signés restant à facturer</dt>
              <dd className="font-semibold">{formatEuros(i.backlogCents)}</dd>
            </div>
          </dl>
        </Section>
        <Section title="Étapes de la cession">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {TRANSFER_STEPS.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}
