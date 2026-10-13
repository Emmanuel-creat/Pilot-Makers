import Link from "next/link";
import { PageHeader, Section } from "@/components/ui";
import { centsToInput, formatEuros } from "@/lib/calc/format";
import { highlights, totals } from "@/lib/acquisition";
import { requirePageCtx } from "@/lib/server/session";
import { acquisition, getAcquisitionCosts, SOURCES } from "@/lib/services/acquisition";
import { LEAD_SOURCES } from "@/lib/services/leads-labels";
import { parisDate } from "@/lib/services/quotes";
import { CostsForm } from "./CostsForm";

export const metadata = { title: "Origine des clients" };

const pct = (bp: number | null) => (bp === null ? "-" : `${(bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} %`);
const money = (c: number | null) => (c === null ? "-" : formatEuros(c));
const ratio = (r: number | null) => (r === null ? "-" : `${(r / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

export default async function OriginPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const current = Number(parisDate(new Date()).slice(0, 4));
  const year = /^\d{4}$/.test(sp.annee ?? "") && Math.abs(Number(sp.annee) - current) <= 10 ? Number(sp.annee) : current;
  const [rows, costs] = await Promise.all([acquisition(ctx, year), getAcquisitionCosts(ctx, year)]);
  const all = totals(rows);
  const h = highlights(rows);
  const label = (s: string | null) => rows.find((r) => r.source === s)?.label.toLowerCase();
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={`Origine des clients ${year}`}
        subtitle="D'où viennent vos demandes, combien deviennent des chantiers, et ce que vous coûte chaque client gagné."
        back={{ href: "/app/rapports", label: "Rapports" }}
        actions={
          <>
            <Link className="btn-secondary" href={`/app/rapports/origine?annee=${year - 1}`}>
              {year - 1}
            </Link>
            <Link className="btn-secondary" href={`/app/rapports/origine?annee=${year + 1}`}>
              {year + 1}
            </Link>
          </>
        }
      />
      {h.best || h.costliest ? (
        <ul className="space-y-1 text-sm" data-testid="origine-faits">
          {h.best ? <li>Meilleur rendement : {label(h.best)}.</li> : null}
          {h.costliest && h.costliest !== h.best ? <li>Client gagné le plus cher : {label(h.costliest)}.</li> : null}
        </ul>
      ) : null}
      <Section
        title="Par source"
        description="Demandes reçues et gagnées dans l'année. Le chiffre d'affaires est celui facturé dans l'année aux clients venus par chaque source (source de leur première demande)."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Demandes, transformation, chiffre d&apos;affaires et coût d&apos;acquisition par source</caption>
            <thead>
              <tr className="text-left">
                {["Source", "Demandes", "Gagnées", "Transformation", "CA HT facturé", "Dépenses", "Coût par client gagné", "CA pour 1 € dépensé"].map(
                  (t, i) => (
                    <th key={t} scope="col" className={`table-head py-2 pr-3 ${i ? "text-right" : ""}`}>
                      {t}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...rows, { ...all, source: "total", label: "Total" }].map((r) => (
                <tr key={r.source} className={r.source === "total" ? "font-semibold" : ""}>
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {r.label}
                  </th>
                  <td className="tabular py-2 pr-3 text-right">{r.leads}</td>
                  <td className="tabular py-2 pr-3 text-right">{r.won}</td>
                  <td className="tabular py-2 pr-3 text-right">{pct(r.conversionBp)}</td>
                  <td className="tabular py-2 pr-3 text-right">{formatEuros(r.revenueCents)}</td>
                  <td className="tabular py-2 pr-3 text-right">{r.costCents ? formatEuros(r.costCents) : "-"}</td>
                  <td className="tabular py-2 pr-3 text-right">{money(r.costPerWonCents)}</td>
                  <td className="tabular py-2 pr-3 text-right">{ratio(r.returnPer100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          La source se choisit à l&apos;enregistrement de chaque demande. Un client créé sans demande apparaît en « Origine non renseignée ».
        </p>
      </Section>
      {canEdit ? (
        <Section
          title={`Dépenses de prospection ${year}`}
          description="Ce que vous avez payé pour obtenir des demandes : abonnement à une plateforme, publicité, salon, site internet, cadeaux de parrainage."
        >
          <CostsForm
            year={year}
            sources={SOURCES.map((k) => ({ key: k, label: LEAD_SOURCES[k] }))}
            values={Object.fromEntries(Object.entries(costs).map(([k, v]) => [k, centsToInput(v!)]))}
          />
        </Section>
      ) : null}
    </div>
  );
}
