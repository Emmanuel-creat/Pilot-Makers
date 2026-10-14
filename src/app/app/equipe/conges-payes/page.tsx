import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Notice, PageHeader, Section, fmtDate } from "@/components/ui";
import { formatEuros } from "@/lib/calc/format";
import { contributionCents, isPeriod, previousPeriod } from "@/lib/leave-fund";
import { requirePageCtx } from "@/lib/server/session";
import { can } from "@/lib/services/context";
import { getDeclaration } from "@/lib/services/leave-fund";
import { parisDate } from "@/lib/services/quotes";
import { DeclarationForm, LeaveFundForm, MarkSent } from "./LeaveForms";

export const metadata = { title: "Congés payés du bâtiment" };

const hours = (min: number) => `${(min / 60).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h`;
const eurosField = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2).replace(".", ","));

export default async function LeaveFundPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const ctx = await requirePageCtx();
  if (!can(ctx, "staff")) notFound();
  const sp = await searchParams;
  const period = sp.periode && isPeriod(sp.periode) ? sp.periode : previousPeriod(parisDate(new Date()).slice(0, 7));
  const d = await getDeclaration(ctx, period);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const locked = d.status === "transmise" || !canEdit;
  const month = new Date(`${period}-01T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Congés payés du bâtiment"
        back={{ href: "/app/equipe", label: "Équipe" }}
        subtitle="Déclaration mensuelle à la caisse de congés payés, préparée depuis le pointage et les absences de vos salariés."
      />
      <div className="space-y-6">
        <Section title="Votre caisse" description="Le taux de cotisation figure sur l'appel de cotisations de votre caisse.">
          {canEdit ? (
            <LeaveFundForm
              fundName={d.settings.fundName}
              memberNumber={d.settings.memberNumber}
              rate={d.settings.rateBp ? String(d.settings.rateBp / 100).replace(".", ",") : ""}
            />
          ) : (
            <p className="text-sm">{d.settings.fundName || "Caisse non renseignée"}</p>
          )}
        </Section>
        <Section
          title={`Déclaration de ${month}`}
          actions={
            <form className="flex items-end gap-2" action="/app/equipe/conges-payes">
              <div>
                <label className="label" htmlFor="cp-period">
                  Mois
                </label>
                <input id="cp-period" name="periode" type="month" className="field" defaultValue={period} />
              </div>
              <button className="btn-secondary">Afficher</button>
            </form>
          }
        >
          {d.status === "transmise" ? (
            <div className="mb-3">
              <Notice tone="success" title="Déclaration transmise">
                Marquée comme transmise à la caisse le {fmtDate(d.sentAt)}. Elle ne se modifie plus.
              </Notice>
            </div>
          ) : null}
          {d.lines.length ? (
            <DeclarationForm period={period} locked={locked} lines={d.lines.map((l) => ({ userId: l.userId, name: l.name, gross: eurosField(l.grossCents) }))}>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" data-testid="declaration-cp">
                  <caption className="sr-only">Salariés déclarés pour {month}</caption>
                  <thead className="table-head">
                    <tr>
                      <th scope="col" className="px-2 py-2">
                        Salarié
                      </th>
                      <th scope="col" className="px-2 py-2 text-right">
                        Heures
                      </th>
                      <th scope="col" className="px-2 py-2 text-right">
                        Jours travaillés
                      </th>
                      <th scope="col" className="px-2 py-2 text-right">
                        Congés pris
                      </th>
                      <th scope="col" className="px-2 py-2 text-right">
                        Maladie
                      </th>
                      <th scope="col" className="px-2 py-2 text-right">
                        Jours acquis
                      </th>
                      <th scope="col" className="px-2 py-2 text-right">
                        Brut
                      </th>
                      <th scope="col" className="px-2 py-2 text-right">
                        Cotisation
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {d.lines.map((l) => (
                      <tr key={l.userId}>
                        <td className="px-2 py-2">
                          {l.name}
                          {l.qualification ? <span className="block text-xs text-muted">{l.qualification}</span> : null}
                        </td>
                        <td className="px-2 py-2 text-right tabular">{hours(l.minutes)}</td>
                        <td className="px-2 py-2 text-right tabular">{l.workedDays}</td>
                        <td className="px-2 py-2 text-right tabular">{l.leaveDays}</td>
                        <td className="px-2 py-2 text-right tabular">{l.sickDays}</td>
                        <td className="px-2 py-2 text-right tabular">{String(l.acquiredDays).replace(".", ",")}</td>
                        <td className="px-2 py-2 text-right tabular">{l.grossCents != null ? formatEuros(l.grossCents) : "-"}</td>
                        <td className="px-2 py-2 text-right tabular">{l.grossCents != null ? formatEuros(contributionCents(l.grossCents, d.rateBp)) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm">
                Total brut {formatEuros(d.totalGrossCents)}, cotisation {formatEuros(d.contributionCents)}
                {d.rateBp ? ` au taux de ${String(d.rateBp / 100).replace(".", ",")} %` : ""}.
                {!d.saved ? " Brouillon : les salaires reprennent ceux du mois précédent." : ""}
              </p>
            </DeclarationForm>
          ) : (
            <p className="text-sm text-muted">Aucun salarié à déclarer : le chef d&apos;entreprise, le gérant et le comptable ne sont pas déclarés.</p>
          )}
          {d.saved ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <a className="btn-secondary" href={`/api/conges-payes?periode=${period}`}>
                <Icon name="download" size={16} /> Exporter pour la caisse
              </a>
              {d.status === "preparee" && canEdit ? <MarkSent period={period} /> : null}
            </div>
          ) : null}
        </Section>
      </div>
    </div>
  );
}
