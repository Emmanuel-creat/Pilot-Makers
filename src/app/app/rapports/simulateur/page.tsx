import Link from "next/link";
import { PageHeader, Section } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { marginRate, simulateHire, simulatePrice, simulateVehicle, type Baseline } from "@/lib/decisions";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { decisionBaseline } from "@/lib/services/decisions";

export const metadata = { title: "Simulateur de décisions" };

const SCENARIOS = { embauche: "Embaucher", prix: "Augmenter les prix", vehicule: "Acheter un véhicule" } as const;
type Scenario = keyof typeof SCENARIOS;
type SP = Record<string, string | undefined>;

const n = (v: string | undefined, d: number) => {
  const x = Number((v ?? "").replace(/\s/g, "").replace(",", "."));
  return v !== undefined && v !== "" && Number.isFinite(x) && x >= 0 ? x : d;
};
const euros = (c: number) => (c / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2, useGrouping: false });
const signed = (c: number) => `${c > 0 ? "+" : ""}${formatEuros(c)}`;

function Field({ name, label, value, suffix }: { name: string; label: string; value: number | string; suffix?: string }) {
  return (
    <div>
      <label className="label" htmlFor={`sim-${name}`}>
        {label}
        {suffix ? <span className="text-muted"> ({suffix})</span> : null}
      </label>
      <input id={`sim-${name}`} name={name} inputMode="decimal" className="field" defaultValue={String(value).replace(".", ",")} />
    </div>
  );
}

function Result({ rows, verdict, good }: { rows: [string, string][]; verdict: string; good: boolean | null }) {
  return (
    <div className="rounded-md border border-line p-4" data-testid="resultat">
      <p className={`mb-3 font-semibold ${good === null ? "" : good ? "text-success" : "text-warning"}`}>{verdict}</p>
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[minmax(0,1fr)_auto]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="tabular sm:text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default async function SimulatorPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Simulateur de décisions" back={{ href: "/app/rapports", label: "Rapports" }} />
        <p className="text-sm text-muted">
          Le simulateur s&apos;appuie sur le chiffre d&apos;affaires : il est réservé aux personnes qui voient la facturation.
        </p>
      </div>
    );
  }
  const sp = await searchParams;
  const data = await decisionBaseline(ctx);
  const scenario: Scenario = sp.scenario && sp.scenario in SCENARIOS ? (sp.scenario as Scenario) : "embauche";
  const b: Baseline = {
    revenueCents: Math.round(n(sp.ca, data.revenueCents / 100) * 100),
    costsCents: Math.round(n(sp.achats, data.costsCents / 100) * 100),
    hourlyRateCents: Math.round(n(sp.taux, data.hourlyRateCents ? data.hourlyRateCents / 100 : 45) * 100),
  };
  const common = (
    <>
      <input type="hidden" name="scenario" value={scenario} />
      <Field name="ca" label="Chiffre d'affaires annuel HT" value={euros(b.revenueCents)} suffix="€" />
      <Field name="achats" label="Achats et frais annuels HT" value={euros(b.costsCents)} suffix="€" />
      <Field name="taux" label="Taux horaire facturé HT" value={euros(b.hourlyRateCents)} suffix="€" />
    </>
  );

  let form: React.ReactNode;
  let result: React.ReactNode;
  if (scenario === "embauche") {
    const h = {
      grossMonthlyCents: Math.round(n(sp.brut, 2200) * 100),
      employerFactor: n(sp.charges, 1.45),
      billableHours: n(sp.heures, 120),
      rampMonths: n(sp.formation, 2),
      materialRate: n(sp.fournitures, 10) / 100,
    };
    const r = simulateHire(b, h);
    form = (
      <>
        {common}
        <Field name="brut" label="Salaire brut mensuel" value={euros(h.grossMonthlyCents)} suffix="€" />
        <Field name="charges" label="Coefficient de charges patronales" value={h.employerFactor} />
        <Field name="heures" label="Heures facturables par mois" value={h.billableHours} />
        <Field name="formation" label="Mois de montée en compétence" value={h.rampMonths} />
        <Field name="fournitures" label="Fournitures liées" value={h.materialRate * 100} suffix="% du CA" />
      </>
    );
    result = (
      <Result
        good={r.result >= 0}
        verdict={
          r.result >= 0
            ? `L'embauche rapporte environ ${formatEuros(r.result)} la première année.`
            : `L'embauche coûte environ ${formatEuros(-r.result)} la première année.`
        }
        rows={[
          ["Coût employeur annuel", formatEuros(r.yearlyCost)],
          ["Chiffre d'affaires facturé en plus", formatEuros(r.revenue)],
          ["Fournitures en plus", formatEuros(r.extraCosts)],
          ["Effet sur le résultat", signed(r.result)],
          ["Heures facturées par mois pour couvrir son coût", r.breakEvenHoursPerMonth === null ? "-" : `${r.breakEvenHoursPerMonth} h`],
        ]}
      />
    );
  } else if (scenario === "prix") {
    const p = { increasePct: n(sp.hausse, 5), volumeLossPct: n(sp.perte, 3) };
    const r = simulatePrice(b, p);
    form = (
      <>
        {common}
        <Field name="hausse" label="Hausse des prix" value={p.increasePct} suffix="%" />
        <Field name="perte" label="Chiffre d'affaires perdu (devis refusés en plus)" value={p.volumeLossPct} suffix="%" />
      </>
    );
    result = (
      <Result
        good={r.delta >= 0}
        verdict={
          r.delta >= 0
            ? `La hausse améliore le résultat d'environ ${formatEuros(r.delta)} par an.`
            : `La hausse réduit le résultat d'environ ${formatEuros(-r.delta)} par an.`
        }
        rows={[
          ["Marge actuelle", `${Math.round(marginRate(b) * 100)} %`],
          ["Chiffre d'affaires après hausse", formatEuros(r.revenue)],
          ["Marge avant", formatEuros(r.before)],
          ["Marge après", formatEuros(r.after)],
          ["Perte de volume supportable", r.breakEvenLossPct === null ? "-" : `${r.breakEvenLossPct.toLocaleString("fr-FR")} %`],
        ]}
      />
    );
  } else {
    const v = {
      priceCents: Math.round(n(sp.prix, 32000) * 100),
      months: Math.max(1, Math.round(n(sp.duree, 48))),
      rateBp: Math.round(n(sp.tauxcredit, 5.5) * 100),
      runningMonthlyCents: Math.round(n(sp.frais, 350) * 100),
      savedMonthlyCents: Math.round(n(sp.economie, 0) * 100),
    };
    const r = simulateVehicle(b, v);
    form = (
      <>
        {common}
        <Field name="prix" label="Prix du véhicule HT" value={euros(v.priceCents)} suffix="€" />
        <Field name="duree" label="Durée du financement" value={v.months} suffix="mois" />
        <Field name="tauxcredit" label="Taux du financement" value={v.rateBp / 100} suffix="%" />
        <Field name="frais" label="Assurance, entretien, carburant par mois" value={euros(v.runningMonthlyCents)} suffix="€" />
        <Field name="economie" label="Location ou ancien véhicule évité par mois" value={euros(v.savedMonthlyCents)} suffix="€" />
      </>
    );
    result = (
      <Result
        good={null}
        verdict={`Le véhicule coûte environ ${formatEuros(r.netMonthly)} par mois, soit ${r.hoursNeededPerMonth} heure${r.hoursNeededPerMonth > 1 ? "s" : ""} facturée${r.hoursNeededPerMonth > 1 ? "s" : ""} de plus par mois.`}
        rows={[
          ["Mensualité du financement", formatEuros(r.monthlyPayment)],
          ["Coût mensuel net", formatEuros(r.netMonthly)],
          ["Coût annuel", formatEuros(r.yearly)],
          ["Chiffre d'affaires à ajouter pour le couvrir", r.revenueNeeded === null ? "-" : formatEuros(r.revenueNeeded)],
        ]}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Simulateur de décisions"
        subtitle={
          data.hasData
            ? `Chiffres de départ : vos 12 derniers mois (${formatEuros(data.revenueCents)} HT facturés). Modifiez les hypothèses pour tester.`
            : "Pas encore assez de factures : saisissez vos chiffres annuels pour tester une décision."
        }
        back={{ href: "/app/rapports", label: "Rapports" }}
      />
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Décision à simuler">
        {(Object.keys(SCENARIOS) as Scenario[]).map((k) => (
          <Link
            key={k}
            href={`/app/rapports/simulateur?scenario=${k}`}
            className={k === scenario ? "btn-primary" : "btn-secondary"}
            aria-current={k === scenario ? "page" : undefined}
          >
            {SCENARIOS[k]}
          </Link>
        ))}
      </nav>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Section title="Hypothèses">
          <form method="get" className="grid gap-3 sm:grid-cols-2">
            {form}
            <div className="sm:col-span-2">
              <button type="submit" className="btn-primary">
                Calculer
              </button>
            </div>
          </form>
        </Section>
        <Section title="Effet estimé" description="Ordre de grandeur hors impôts et trésorerie, à confirmer avec votre comptable avant de décider.">
          {result}
        </Section>
      </div>
    </div>
  );
}
