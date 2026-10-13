import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { Icon } from "@/components/Icon";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { monthBounds, nextMonth, vatReturn } from "@/lib/services/finance";
import { parisDate } from "@/lib/services/quotes";
import { monthLabel } from "@/lib/services/reports";

export const metadata = { title: "TVA à déclarer" };

const rate = (bp: number) => `${(bp / 100).toString().replace(".", ",")} %`;

export default async function VatPage({ searchParams }: { searchParams: Promise<{ mois?: string; trimestre?: string }> }) {
  const ctx = await requirePageCtx();
  const sp = await searchParams;
  const current = parisDate(new Date()).slice(0, 7);
  const month = /^\d{4}-\d{2}$/.test(sp.mois ?? "") ? sp.mois! : nextMonth(current, -1);
  const quarter = sp.trimestre === "1";
  const first = quarter ? nextMonth(month, -2) : month;
  const from = monthBounds(first).from;
  const to = monthBounds(month).to;
  const label = quarter ? `${monthLabel(first)} à ${monthLabel(month)}` : monthLabel(month);
  const choices = Array.from({ length: 12 }, (_, i) => nextMonth(current, -i));

  if (!can(ctx, "billing")) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="TVA à déclarer" back={{ href: "/app/rapports", label: "Rapports" }} />
        <p className="card p-5 text-sm">La TVA est réservée aux personnes qui gèrent la facturation.</p>
      </div>
    );
  }
  const v = await vatReturn(ctx, from, to);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="TVA à déclarer"
        back={{ href: "/app/rapports", label: "Rapports" }}
        subtitle="Préparation de votre déclaration à partir des règlements reçus et des notes de frais validées. À vérifier avant de la reporter sur impots.gouv.fr."
        actions={
          <a className="btn-secondary" href={`/api/reports/tva?du=${from}&au=${to}`}>
            <Icon name="download" size={16} /> Tableur (CSV)
          </a>
        }
      />
      <form className="card mb-6 flex flex-wrap items-end gap-3 p-4" method="get">
        <div>
          <label className="label" htmlFor="tva-mois">
            {quarter ? "Dernier mois du trimestre" : "Mois"}
          </label>
          <select id="tva-mois" name="mois" className="field" defaultValue={month}>
            {choices.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="trimestre" value="1" defaultChecked={quarter} /> Déclaration trimestrielle
        </label>
        <button className="btn-secondary">Afficher</button>
      </form>

      {v.franchise ? (
        <p className="card p-5 text-sm">
          Votre entreprise est en franchise en base de TVA : vous ne facturez pas de TVA et n&apos;avez pas de déclaration à déposer. Surveillez les
          seuils de chiffre d&apos;affaires de la franchise.
        </p>
      ) : (
        <section className="card p-5" aria-labelledby="tva-titre">
          <h2 id="tva-titre" className="font-semibold">
            Période : {label}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {v.payments} règlement(s) reçu(s) pour {formatEuros(v.receivedCents)} TTC. Les travaux étant des prestations de services, la TVA est due à
            l&apos;encaissement.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm" data-testid="tva-tableau">
              <caption className="sr-only">TVA de la période</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 font-medium">Rubrique</th>
                  <th className="py-2 text-right font-medium">Base HT</th>
                  <th className="py-2 text-right font-medium">TVA</th>
                </tr>
              </thead>
              <tbody>
                {v.collected.map((g) => (
                  <tr key={g.vatBp} className="border-b border-line">
                    <td className="py-2">TVA collectée à {rate(g.vatBp)}</td>
                    <td className="tabular py-2 text-right">{formatEuros(g.baseCents)}</td>
                    <td className="tabular py-2 text-right">{formatEuros(g.vatCents)}</td>
                  </tr>
                ))}
                {v.untaxedCents ? (
                  <tr className="border-b border-line">
                    <td className="py-2">Encaissements sans TVA (autoliquidation en sous-traitance)</td>
                    <td className="tabular py-2 text-right">{formatEuros(v.untaxedCents)}</td>
                    <td className="tabular py-2 text-right">-</td>
                  </tr>
                ) : null}
                <tr className="border-b border-line font-medium">
                  <td className="py-2">Total TVA collectée</td>
                  <td />
                  <td className="tabular py-2 text-right">{formatEuros(v.collectedCents)}</td>
                </tr>
                <tr className="border-b border-line">
                  <td className="py-2">TVA déductible ({v.expenses} note(s) de frais validée(s))</td>
                  <td />
                  <td className="tabular py-2 text-right">- {formatEuros(v.deductibleCents)}</td>
                </tr>
                <tr className="text-base font-semibold">
                  <td className="py-3">{v.netCents >= 0 ? "TVA nette à payer" : "Crédit de TVA"}</td>
                  <td />
                  <td className="tabular py-3 text-right">{formatEuros(Math.abs(v.netCents))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted">
            <li>Ajoutez la TVA de vos factures d&apos;achat (fournisseurs, sous-traitants, matériel), qui n&apos;est pas encore saisie ici.</li>
            <li>Un avoir sur une facture déjà réglée entraîne une régularisation : voyez-la avec votre comptable.</li>
            <li>
              Si vous avez opté pour la TVA sur les débits, la TVA est due à la facturation : utilisez plutôt le{" "}
              <Link className="link" href="/app/factures">
                fichier des écritures comptables
              </Link>
              .
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}
