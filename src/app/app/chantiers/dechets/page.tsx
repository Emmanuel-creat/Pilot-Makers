import Link from "next/link";
import { Icon } from "@/components/Icon";
import { Empty, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { requirePageCtx } from "@/lib/server/session";
import { parisDate } from "@/lib/services/quotes";
import { wasteRegister } from "@/lib/services/waste";
import { categoryByKey, entryIssues, WASTE_CLASSES, WASTE_UNITS, wasteSummary } from "@/lib/waste";

export const metadata = { title: "Registre des déchets" };

const qty = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 3 });

export default async function WasteRegisterPage({ searchParams }: { searchParams: Promise<{ annee?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const current = Number(parisDate(new Date()).slice(0, 4));
  const year = /^\d{4}$/.test(sp.annee ?? "") && Number(sp.annee) >= 2000 && Number(sp.annee) <= current ? Number(sp.annee) : current;
  const lines = await wasteRegister(ctx, year);
  const sum = wasteSummary(lines.map((l) => l.entry));
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Registre des déchets"
        back={{ href: "/app/chantiers", label: "Chantiers" }}
        subtitle="Registre chronologique des déchets sortants de vos chantiers, à conserver trois ans."
        actions={
          lines.length ? (
            <a className="btn-secondary" href={`/api/dechets/registre?annee=${year}`}>
              <Icon name="download" size={16} /> Exporter {year} (CSV)
            </a>
          ) : null
        }
      />
      <nav className="mb-4 flex gap-1" aria-label="Année">
        {[current, current - 1, current - 2].map((y) => (
          <Link
            key={y}
            href={`/app/chantiers/dechets?annee=${y}`}
            aria-current={y === year ? "page" : undefined}
            className={`rounded-full px-3 py-1.5 text-sm ${y === year ? "bg-accent text-white dark:text-[#0d1520]" : "bg-surface text-muted hover:text-ink"}`}
          >
            {y}
          </Link>
        ))}
      </nav>
      {lines.length ? (
        <div className="space-y-6">
          <Section title={`Bilan ${year}`}>
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              {sum.byClass.map((c) => (
                <div key={c.cls}>
                  <dt className="text-muted">{c.label}</dt>
                  <dd className="tabular font-semibold">
                    {[c.tonnes ? `${qty(c.tonnes)} t` : "", c.volumeM3 ? `${qty(c.volumeM3)} m³` : ""].filter(Boolean).join(" + ")}
                  </dd>
                </div>
              ))}
              <div>
                <dt className="text-muted">Coût des évacuations</dt>
                <dd className="tabular font-semibold">{formatEuros(sum.costCents)}</dd>
              </div>
            </dl>
            {sum.missing ? (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-warning">
                <Icon name="alert" size={16} /> {sum.missing} évacuation{sum.missing > 1 ? "s" : ""} sans installation de destination ou sans bordereau.
              </p>
            ) : null}
          </Section>
          <Section title="Évacuations">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Chantier</th>
                    <th className="py-2 pr-3 font-medium">Déchet</th>
                    <th className="py-2 pr-3 text-right font-medium">Quantité</th>
                    <th className="py-2 pr-3 font-medium">Destination</th>
                    <th className="py-2 font-medium">Bordereau</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lines.map((l) => {
                    const c = categoryByKey(l.entry.category);
                    const issues = entryIssues(l.entry);
                    return (
                      <tr key={l.entry.id}>
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(l.entry.date)}</td>
                        <td className="py-2 pr-3">
                          <Link className="link" href={`/app/chantiers/${l.jobId}`}>
                            {l.jobTitle}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">
                          {c?.label ?? l.entry.category}
                          <span className="block text-xs text-muted">
                            {c?.code} {c ? WASTE_CLASSES[c.cls].toLowerCase() : ""}
                          </span>
                        </td>
                        <td className="tabular py-2 pr-3 text-right whitespace-nowrap">
                          {qty(l.entry.quantity)} {WASTE_UNITS[l.entry.unit]}
                        </td>
                        <td className="py-2 pr-3">{l.entry.destination || <span className="text-warning">À indiquer</span>}</td>
                        <td className="py-2">{l.entry.slipRef || (issues.length ? <span className="text-warning">Manquant</span> : "-")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      ) : (
        <Empty icon="trash" title={`Aucune évacuation en ${year}`}>
          Notez les évacuations de déchets depuis la fiche de chaque chantier : elles s'ajoutent ici, prêtes à exporter.
        </Empty>
      )}
    </div>
  );
}
