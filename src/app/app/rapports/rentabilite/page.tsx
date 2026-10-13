import Link from "next/link";
import { Empty, PageHeader, Section } from "@/components/ui";
import { formatEuros, formatPercent } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { groupProfits, profitability, type ProfitGroup } from "@/lib/services/profitability";
import { parisDate } from "@/lib/services/quotes";

export const metadata = { title: "Rentabilité" };

const NATURES = { main_oeuvre: "Main-d'œuvre", materiau: "Matériaux", sous_traitance: "Sous-traitance", autre: "Autres" } as const;

const tone = (bp: number | null) => (bp === null ? "text-muted" : bp < 0 ? "text-danger" : bp < 1500 ? "text-warning" : "text-success");

function GroupTable({ caption, head, rows, href }: { caption: string; head: string; rows: ProfitGroup[]; href?: (key: string) => string | null }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-left">
            <th scope="col" className="table-head py-2 pr-3">
              {head}
            </th>
            <th scope="col" className="table-head py-2 pr-3 text-right">
              Chantiers
            </th>
            <th scope="col" className="table-head py-2 pr-3 text-right">
              Vendu HT
            </th>
            <th scope="col" className="table-head py-2 pr-3 text-right">
              Coûts réels
            </th>
            <th scope="col" className="table-head py-2 text-right">
              Marge
            </th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((g) => {
            const link = href?.(g.key);
            return (
              <tr key={g.key} className="border-t border-line">
                <th scope="row" className="py-2 pr-3 text-left font-normal">
                  {link ? (
                    <Link className="link inline-flex min-h-6 items-center" href={link}>
                      {g.label}
                    </Link>
                  ) : (
                    g.label
                  )}
                </th>
                <td className="py-2 pr-3 text-right">{g.jobs}</td>
                <td className="py-2 pr-3 text-right">{formatEuros(g.soldCents)}</td>
                <td className="py-2 pr-3 text-right">{formatEuros(g.costCents)}</td>
                <td className={`py-2 text-right ${tone(g.marginBp)}`}>
                  {formatEuros(g.marginCents)}
                  {g.marginBp !== null ? ` (${formatPercent(g.marginBp)})` : ""}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function ProfitabilityPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const all = sp.periode === "tout";
  const today = parisDate(new Date());
  const since = all ? undefined : `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  const { jobs, natures } = await profitability(ctx, { since });
  const byCustomer = groupProfits(jobs, (j) => [j.customerId ?? "aucun", j.customerName]);
  const byType = groupProfits(jobs, (j) => [j.type, j.type]);
  const total = groupProfits(jobs, () => ["total", "Total"])[0];
  const worst = [...jobs]
    .map((j) => ({ ...j, margin: j.soldCents - j.laborCents - j.purchasesCents }))
    .sort((a, b) => a.margin - b.margin)
    .slice(0, 5);
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Rentabilité"
        subtitle="Marge réelle des chantiers : vendu au devis, face aux heures pointées et aux achats saisis."
        back={{ href: "/app/rapports", label: "Rapports" }}
        actions={
          <>
            <Link className={all ? "btn-secondary" : "btn-primary"} href="/app/rapports/rentabilite" aria-current={all ? undefined : "page"}>
              12 derniers mois
            </Link>
            <Link className={all ? "btn-primary" : "btn-secondary"} href="/app/rapports/rentabilite?periode=tout" aria-current={all ? "page" : undefined}>
              Depuis le début
            </Link>
          </>
        }
      />
      {!jobs.length ? (
        <Empty icon="chart" title="Aucun chantier en cours ou terminé">
          La rentabilité apparaît dès qu&apos;un chantier démarre et que des heures ou des achats y sont saisis.
        </Empty>
      ) : (
        <>
          <p className="text-sm">
            Sur {total.jobs} chantier{total.jobs > 1 ? "s" : ""} : {formatEuros(total.soldCents)} vendus, {formatEuros(total.costCents)} de coûts réels,{" "}
            <span className={tone(total.marginBp)}>
              marge de {formatEuros(total.marginCents)}
              {total.marginBp !== null ? ` (${formatPercent(total.marginBp)})` : ""}
            </span>
            .
          </p>
          <Section title="Par client">
            <GroupTable caption="Rentabilité par client" head="Client" rows={byCustomer} href={(k) => (k === "aucun" ? null : `/app/clients/${k}`)} />
          </Section>
          <Section title="Par type de chantier" description="Type déduit de l'intitulé du chantier : salle de bain, toiture, isolation, peinture...">
            <GroupTable caption="Rentabilité par type de chantier" head="Type" rows={byType} />
          </Section>
          <Section title="Par nature de prestation" description="Vendu par nature dans les devis, face aux heures (main-d'œuvre) et aux achats par catégorie.">
            <GroupTable
              caption="Rentabilité par nature de prestation"
              head="Nature"
              rows={natures.map((n) => ({
                key: n.nature,
                label: NATURES[n.nature],
                jobs: total.jobs,
                soldCents: n.soldCents,
                costCents: n.costCents,
                marginCents: n.soldCents - n.costCents,
                marginBp: n.soldCents > 0 ? Math.round(((n.soldCents - n.costCents) * 10000) / n.soldCents) : null,
              }))}
            />
          </Section>
          <Section title="Chantiers les moins rentables">
            <ul className="divide-y divide-line text-sm">
              {worst.map((j) => (
                <li key={j.jobId} className="flex flex-wrap justify-between gap-2 py-2">
                  <Link className="link inline-flex min-h-6 items-center" href={`/app/chantiers/${j.jobId}`}>
                    {j.title}
                  </Link>
                  <span className={`tabular ${j.margin < 0 ? "text-danger" : "text-muted"}`}>
                    {j.customerName}, marge {formatEuros(j.margin)}
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}
    </div>
  );
}
