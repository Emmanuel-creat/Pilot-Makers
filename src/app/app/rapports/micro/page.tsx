import Link from "next/link";
import { Notice, PageHeader, Section, Stat } from "@/components/ui";
import { formatEuros, formatPercent } from "@/lib/calc/format";
import { ceilingStatus, contributions, MICRO_RULES, vatStatus, type Level } from "@/lib/micro";
import { requirePageCtx } from "@/lib/server/session";
import { getOrganization } from "@/lib/services/organization";
import { microYear } from "@/lib/services/micro";
import { parisDate } from "@/lib/services/quotes";

export const metadata = { title: "Micro-entreprise" };

const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const TONE: Record<Level, string> = { ok: "bg-success", attention: "bg-warning", depasse: "bg-danger" };
const TEXT: Record<Level, string> = { ok: "text-muted", attention: "text-warning", depasse: "text-danger" };

function Gauge({ label, amount, threshold, lv, hint }: { label: string; amount: number; threshold: number; lv: Level; hint?: string }) {
  const ratio = Math.min(100, Math.round((amount * 100) / threshold));
  return (
    <div>
      <div className="mb-1 flex flex-wrap justify-between gap-2 text-sm">
        <span>{label}</span>
        <span className={`tabular ${TEXT[lv]}`}>
          {formatEuros(amount)} sur {formatEuros(threshold)} ({ratio} %)
        </span>
      </div>
      <div className="h-2 rounded-full bg-surface-2" role="progressbar" aria-label={label} aria-valuenow={ratio} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-2 rounded-full ${TONE[lv]}`} style={{ width: `${ratio}%` }} />
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export default async function MicroPage({ searchParams }: { searchParams: Promise<{ annee?: string; ventilation?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const current = Number(parisDate(new Date()).slice(0, 4));
  const year = /^\d{4}$/.test(sp.annee ?? "") && Math.abs(Number(sp.annee) - current) <= 10 ? Number(sp.annee) : current;
  const split = sp.ventilation === "1";
  const [org, data] = await Promise.all([getOrganization(ctx), microYear(ctx, year)]);
  const ceiling = ceilingStatus(data.total, split);
  const vat = vatStatus(data.total, split);
  const due = contributions(data.total, split);
  const total = data.total.services + data.total.sales;
  const link = (y: number, v = split) => `/app/rapports/micro?annee=${y}${v ? "&ventilation=1" : ""}`;
  const quarters = [0, 1, 2, 3].map((q) => {
    const ms = data.months.slice(q * 3, q * 3 + 3);
    return { q: q + 1, services: ms.reduce((s, m) => s + m.services, 0), sales: ms.reduce((s, m) => s + m.sales, 0) };
  });
  const declared = (x: { services: number; sales: number }) => (split ? x : { services: x.services + x.sales, sales: 0 });
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={`Micro-entreprise ${year}`}
        subtitle="Encaissements de l'année civile, plafonds du régime, seuils de franchise de TVA et cotisations à prévoir."
        back={{ href: "/app/rapports", label: "Rapports" }}
        actions={
          <>
            <Link className="btn-secondary" href={link(year - 1)}>
              {year - 1}
            </Link>
            {year < current ? (
              <Link className="btn-secondary" href={link(year + 1)}>
                {year + 1}
              </Link>
            ) : null}
          </>
        }
      />
      {year !== MICRO_RULES.year ? (
        <Notice tone="info">
          Les plafonds et taux affichés sont ceux de {MICRO_RULES.year} : vérifiez ceux de {year} sur urssaf.fr.
        </Notice>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label={`Encaissé en ${year}`} value={formatEuros(total)} />
        <Stat label="Cotisations sociales estimées" value={formatEuros(due)} />
        <Stat label="Après cotisations" value={formatEuros(total - due)} />
      </div>
      <Section
        title="Fournitures"
        description="Les matériaux revendus peuvent se déclarer en vente de marchandises, avec un plafond et un taux de cotisations différents, s'ils sont facturés à part de la pose."
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>
            Part des fournitures dans vos encaissements : <span className="tabular font-medium">{formatEuros(data.total.sales)}</span>
          </span>
          <Link className={split ? "btn-primary" : "btn-secondary"} href={link(year, !split)}>
            {split ? "Fournitures déclarées en vente" : "Tout déclarer en prestations"}
          </Link>
        </div>
      </Section>
      <Section title="Plafonds du régime" description="Au-delà deux années de suite, l'entreprise sort du régime micro.">
        <div className="space-y-4">
          <Gauge label="Prestations de services" amount={ceiling.services.amount} threshold={ceiling.services.threshold} lv={ceiling.services.level} />
          {split ? <Gauge label="Total, ventes comprises" amount={ceiling.total.amount} threshold={ceiling.total.threshold} lv={ceiling.total.level} /> : null}
        </div>
      </Section>
      <Section
        title="Franchise de TVA"
        description={
          org.vat_regime === "franchise"
            ? "Vous facturez sans TVA. Au-delà du seuil majoré, la TVA est due dès le premier jour du dépassement ; au-delà du seuil de base, à partir du 1er janvier suivant."
            : "Votre entreprise facture la TVA : ces seuils sont donnés pour information."
        }
      >
        <div className="space-y-4">
          <Gauge
            label="Prestations de services"
            amount={vat.services.amount}
            threshold={vat.services.threshold}
            lv={vat.services.level}
            hint={`Seuil majoré : ${formatEuros(vat.services.major)}`}
          />
          {split ? (
            <Gauge
              label="Total, ventes comprises"
              amount={vat.total.amount}
              threshold={vat.total.threshold}
              lv={vat.total.level}
              hint={`Seuil majoré : ${formatEuros(vat.total.major)}`}
            />
          ) : null}
        </div>
      </Section>
      <Section
        title="À déclarer à l'URSSAF"
        description={`Taux ${MICRO_RULES.year} : ${formatPercent(MICRO_RULES.rateServicesBp)} pour les prestations artisanales, ${formatPercent(MICRO_RULES.rateSalesBp)} pour les ventes. Hors contribution à la formation professionnelle et versement libératoire.`}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Encaissements à déclarer par mois et par trimestre</caption>
            <thead>
              <tr className="text-left">
                <th scope="col" className="table-head py-2 pr-3">
                  Période
                </th>
                <th scope="col" className="table-head py-2 pr-3 text-right">
                  Prestations
                </th>
                {split ? (
                  <th scope="col" className="table-head py-2 pr-3 text-right">
                    Ventes
                  </th>
                ) : null}
                <th scope="col" className="table-head py-2 text-right">
                  Cotisations estimées
                </th>
              </tr>
            </thead>
            <tbody className="tabular">
              {data.months.map((m) => {
                const d = declared(m);
                return (
                  <tr key={m.month} className="border-t border-line">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                      {MONTHS[m.month - 1]}
                    </th>
                    <td className="py-1.5 pr-3 text-right">{formatEuros(d.services)}</td>
                    {split ? <td className="py-1.5 pr-3 text-right">{formatEuros(d.sales)}</td> : null}
                    <td className="py-1.5 text-right">{formatEuros(contributions(m, split))}</td>
                  </tr>
                );
              })}
              {quarters.map((q) => {
                const d = declared(q);
                return (
                  <tr key={q.q} className="border-t border-line font-medium">
                    <th scope="row" className="py-1.5 pr-3 text-left">
                      Trimestre {q.q}
                    </th>
                    <td className="py-1.5 pr-3 text-right">{formatEuros(d.services)}</td>
                    {split ? <td className="py-1.5 pr-3 text-right">{formatEuros(d.sales)}</td> : null}
                    <td className="py-1.5 text-right">{formatEuros(contributions(q, split))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          Montants encaissés (date de paiement enregistrée), acomptes compris, avoirs exclus. Plafonds, seuils et taux {MICRO_RULES.year} à vérifier sur
          urssaf.fr et impots.gouv.fr.
        </p>
      </Section>
    </div>
  );
}
