import { notFound } from "next/navigation";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { REGIMES, type Regime, WORK_WEEKS, ownerPay, readNumber } from "@/lib/owner-pay";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { ownerPayFacts } from "@/lib/services/owner-pay";

export const metadata = { title: "Mon vrai salaire" };

type Params = { regime?: string; taux?: string; heures?: string; autres?: string; objectif?: string };

/** Ce que le dirigeant gagne vraiment par heure travaillée, et ce qu'il faudrait pour vivre correctement de son métier. */
export default async function OwnerPayPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await requirePageCtx();
  if (!can(ctx, "billing")) notFound();
  const sp = await searchParams;
  const f = await ownerPayFacts(ctx);
  const regime: Regime = sp.regime === "micro" ? "micro" : "reel";
  const rate = readNumber(sp.taux, REGIMES[regime].defaultRate, 0, 100);
  const hours = readNumber(sp.heures, f.trackedHoursPerWeek ?? 50, 1, 100);
  const other = readNumber(sp.autres, 0);
  const target = readNumber(sp.objectif, 2500, 0, 100000);
  const p = ownerPay({
    regime,
    revenueCents: f.revenueCents,
    costsCents: f.costsCents,
    otherCostsCents: Math.round(other * 100),
    ratePercent: rate,
    hoursPerWeek: hours,
    targetMonthlyCents: Math.round(target * 100),
  });
  const reached = p.netMonthCents >= Math.round(target * 100);
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Mon vrai salaire"
        subtitle={`Ce qui vous reste vraiment, par mois et par heure travaillée, sur les douze derniers mois (du ${fmtDate(f.from)} au ${fmtDate(f.to)}).`}
        back={{ href: "/app/rapports", label: "Rapports" }}
      />
      <Section title="Votre situation" description="Le chiffre d'affaires et les achats viennent de l'application ; complétez le reste.">
        <form method="get" className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="vs-regime">
              Régime
            </label>
            <select id="vs-regime" name="regime" className="field" defaultValue={regime}>
              {Object.entries(REGIMES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="vs-taux">
              {REGIMES[regime].rateLabel}
            </label>
            <input id="vs-taux" name="taux" className="field" inputMode="decimal" defaultValue={String(rate).replace(".", ",")} />
          </div>
          <div>
            <label className="label" htmlFor="vs-heures">
              Heures travaillées par semaine, bureau compris
            </label>
            <input id="vs-heures" name="heures" className="field" inputMode="decimal" defaultValue={String(hours)} />
            {f.trackedHoursPerWeek != null ? <p className="mt-1 text-xs text-muted">Moyenne de vos pointages : {f.trackedHoursPerWeek} h.</p> : null}
          </div>
          <div>
            <label className="label" htmlFor="vs-autres">
              Charges annuelles non saisies (salaires de l&apos;équipe, loyer...), en euros
            </label>
            <input id="vs-autres" name="autres" className="field" inputMode="decimal" defaultValue={other ? String(other) : ""} placeholder="0" />
          </div>
          <div>
            <label className="label" htmlFor="vs-objectif">
              Revenu net mensuel visé, en euros
            </label>
            <input id="vs-objectif" name="objectif" className="field" inputMode="decimal" defaultValue={String(target)} />
          </div>
          <div className="flex items-end">
            <button type="submit" className="btn-secondary">
              Recalculer
            </button>
          </div>
        </form>
      </Section>
      <Section title="Ce qui vous reste">
        <dl className="grid gap-4 text-sm sm:grid-cols-3" data-testid="vrai-salaire">
          <div>
            <dt className="text-muted">Par mois, net</dt>
            <dd className="text-2xl font-semibold">{formatEuros(p.netMonthCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Par heure travaillée</dt>
            <dd className="text-2xl font-semibold">{formatEuros(p.netHourCents)}</dd>
          </div>
          <div>
            <dt className="text-muted">Heures par an</dt>
            <dd className="text-2xl font-semibold">{p.hoursYear}</dd>
          </div>
        </dl>
        {p.split ? (
          <div className="mt-4 space-y-2 text-sm">
            <p className="text-muted">Sur 100 euros facturés :</p>
            <div className="flex h-3 overflow-hidden rounded-full bg-line" aria-hidden="true">
              <span className="bg-muted" style={{ width: `${Math.max(0, p.split.costs)}%` }} />
              <span className="bg-warning" style={{ width: `${Math.max(0, p.split.contributions)}%` }} />
              <span className="bg-success" style={{ width: `${Math.max(0, p.split.net)}%` }} />
            </div>
            <p>
              {p.split.costs} euros de charges, {p.split.contributions} euros de cotisations, {p.split.net} euros pour vous.
            </p>
          </div>
        ) : null}
        <p className="mt-3 text-xs text-muted">
          Calculé sur {WORK_WEEKS} semaines travaillées par an. Taux de cotisations indicatifs : votre expert-comptable connaît le chiffre exact.
        </p>
      </Section>
      {f.revenueCents <= 0 ? (
        <Notice tone="info" title="Pas encore de chiffre d'affaires">
          Le calcul se précisera avec vos premières factures.
        </Notice>
      ) : reached ? (
        <Notice tone="success" title="Objectif atteint">
          Vous dégagez {formatEuros(p.netMonthCents)} net par mois pour un objectif de {formatEuros(Math.round(target * 100))}.
        </Notice>
      ) : (
        <Notice tone="warning" title="Pour vivre de votre métier">
          Il manque {formatEuros(Math.round(target * 100) - p.netMonthCents)} par mois. À charges égales, il faudrait augmenter vos prix d&apos;environ{" "}
          {String(p.priceIncreasePercent).replace(".", ",")} %, ou réduire vos charges, ou vendre plus d&apos;heures à un meilleur taux plutôt que d&apos;en
          travailler davantage.
        </Notice>
      )}
    </div>
  );
}
