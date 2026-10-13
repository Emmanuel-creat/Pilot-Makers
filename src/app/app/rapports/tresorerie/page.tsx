import Link from "next/link";
import { treasuryAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { centsToInput, formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { treasuryForecast } from "@/lib/services/finance";
import { monthLabel } from "@/lib/services/reports";

export const metadata = { title: "Trésorerie" };

const fr = (iso: string) => iso.split("-").reverse().join("/");

export default async function TreasuryPage() {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) {
    return (
      <div className="mx-auto max-w-4xl">
        <PageHeader title="Trésorerie" back={{ href: "/app/rapports", label: "Rapports" }} />
        <p className="card p-5 text-sm">La trésorerie est réservée aux personnes qui gèrent la facturation.</p>
      </div>
    );
  }
  const f = await treasuryForecast(ctx);
  const rows: [string, (m: (typeof f.months)[number]) => number, string][] = [
    ["Factures à encaisser", (m) => m.invoicesCents, "Échéances des factures émises ; les retards sont comptés ce mois-ci."],
    ["Devis signés à facturer", (m) => m.toInvoiceCents, "Estimation : reste à facturer des devis acceptés."],
    ["TVA à reverser", (m) => -m.vatCents, "TVA du mois précédent."],
    ["Frais avancés à rembourser", (m) => -m.expensesCents, "Notes de frais validées payées par vos équipes."],
    ["Charges fixes", (m) => -m.chargesCents, "Montant mensuel saisi ci-dessous."],
  ];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Trésorerie"
        back={{ href: "/app/rapports", label: "Rapports" }}
        subtitle="Prévision sur 3 mois à partir de votre solde, de vos factures, de vos devis signés et de vos charges. Une estimation pour anticiper, pas un relevé bancaire."
      />
      {f.shortfall ? (
        <div className="card mb-6 flex items-start gap-3 border-danger/40 p-4 text-sm" role="status" data-testid="alerte-tresorerie">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-danger" />
          <p>
            Votre solde estimé devient négatif en {monthLabel(f.shortfall)}. Relancez les factures en retard, facturez les acomptes des devis signés
            ou décalez une dépense.
          </p>
        </div>
      ) : null}
      {f.overdueCount ? (
        <p className="mb-4 text-sm">
          {f.overdueCount} facture(s) en retard pour {formatEuros(f.overdueCents)}.{" "}
          <Link className="link" href="/app/factures">
            Voir les factures
          </Link>
        </p>
      ) : null}
      <section className="card mb-6 overflow-x-auto p-5">
        <table className="w-full text-sm" data-testid="tresorerie-tableau">
          <caption className="sr-only">Trésorerie prévisionnelle par mois</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th className="py-2 font-medium">Mouvement</th>
              {f.months.map((m) => (
                <th key={m.month} className="py-2 text-right font-medium">
                  {monthLabel(m.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, get, hint]) => (
              <tr key={label} className="border-b border-line">
                <th scope="row" className="py-2 text-left font-normal">
                  {label}
                  <span className="block text-xs text-muted">{hint}</span>
                </th>
                {f.months.map((m) => (
                  <td key={m.month} className="tabular py-2 text-right">
                    {formatEuros(get(m))}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-b border-line font-medium">
              <th scope="row" className="py-2 text-left">
                Variation du mois
              </th>
              {f.months.map((m) => (
                <td key={m.month} className="tabular py-2 text-right">
                  {formatEuros(m.netCents)}
                </td>
              ))}
            </tr>
            <tr className="font-semibold">
              <th scope="row" className="py-3 text-left">
                Solde estimé en fin de mois
              </th>
              {f.months.map((m) => (
                <td key={m.month} className={`tabular py-3 text-right ${m.closingCents < 0 ? "text-danger" : ""}`}>
                  {formatEuros(m.closingCents)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>
      <ActionForm action={treasuryAction} className="card space-y-4 p-5">
        <h2 className="font-semibold">Point de départ</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="tr-balance">
              Solde bancaire actuel (€)
            </label>
            <input id="tr-balance" name="balance" inputMode="decimal" className="field" defaultValue={centsToInput(f.settings.balanceCents)} />
            <p className="mt-1 text-xs text-muted">{f.settings.balanceDate ? `Saisi le ${fr(f.settings.balanceDate)}.` : "Pas encore saisi."}</p>
          </div>
          <div>
            <label className="label" htmlFor="tr-charges">
              Charges fixes par mois (€)
            </label>
            <input
              id="tr-charges"
              name="monthlyCharges"
              inputMode="decimal"
              className="field"
              defaultValue={centsToInput(f.settings.monthlyChargesCents)}
            />
            <p className="mt-1 text-xs text-muted">Loyer, salaires et charges sociales, crédits, assurances, abonnements.</p>
          </div>
        </div>
        <Submit>Mettre à jour la prévision</Submit>
      </ActionForm>
    </div>
  );
}
