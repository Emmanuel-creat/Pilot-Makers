import Link from "next/link";
import { PageHeader, Section, fmtDate } from "@/components/ui";
import { MONTH_NAMES, peaks } from "@/lib/workload";
import { requirePageCtx } from "@/lib/server/session";
import { workload } from "@/lib/services/workload";

export const metadata = { title: "Charge et saisonnalité" };

const TONE = (p: number | null) => (p === null ? "bg-surface-2" : p > 100 ? "bg-danger" : p >= 80 ? "bg-warning" : "bg-success");

export default async function WorkloadPage() {
  const ctx = await requirePageCtx();
  const w = await workload(ctx);
  const p = peaks(w.seasonality);
  const max = Math.max(1, ...w.seasonality.map((v) => v ?? 0));
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Charge et saisonnalité"
        subtitle="Les semaines à venir face à la capacité de l'équipe, et les mois forts et calmes de votre activité."
        back={{ href: "/app/rapports", label: "Rapports" }}
      />
      <ul className="space-y-1 text-sm" data-testid="charge-faits">
        <li>
          Équipe comptée : {w.team} personne{w.team > 1 ? "s" : ""}, 5 jours par semaine, absences déduites.
        </li>
        <li>
          Reste à faire non planifié : {w.backlog.days.toLocaleString("fr-FR")} jour{w.backlog.days > 1 ? "s" : ""} sur {w.backlog.jobs.length} chantier
          {w.backlog.jobs.length > 1 ? "s" : ""}
          {w.backlog.unknown ? ` (${w.backlog.unknown} sans main-d'œuvre chiffrée en heures ou en jours)` : ""}.
        </li>
        <li>
          {w.firstFree ? `Première semaine avec de la place : celle du ${fmtDate(w.firstFree)}.` : "Aucune semaine avec de la place sur les 12 prochaines."}
          {w.overflowDays ? ` ${w.overflowDays.toLocaleString("fr-FR")} jours ne tiennent pas dans les 12 semaines.` : ""}
        </li>
      </ul>

      <Section
        title="Charge des 12 prochaines semaines"
        description="Jours planifiés, puis reste à faire des chantiers signés non planifiés, rapportés aux jours disponibles."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Charge prévue par semaine</caption>
            <thead>
              <tr className="text-left">
                {["Semaine du", "Disponible", "Planifié", "À planifier", "Charge"].map((t, i) => (
                  <th key={t} scope="col" className={`table-head py-2 pr-3 ${i ? "text-right" : ""}`}>
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {w.weeks.map((x) => (
                <tr key={x.monday}>
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {fmtDate(x.monday)}
                  </th>
                  <td className="tabular py-2 pr-3 text-right">{x.capacityDays} j</td>
                  <td className="tabular py-2 pr-3 text-right">{x.plannedDays} j</td>
                  <td className="tabular py-2 pr-3 text-right">{x.backlogDays ? `${x.backlogDays.toLocaleString("fr-FR")} j` : ""}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center justify-end gap-2">
                      <span className="h-2 w-24 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                        <span className={`block h-full ${TONE(x.loadPercent)}`} style={{ width: `${Math.min(100, x.loadPercent ?? 0)}%` }} />
                      </span>
                      <span className="tabular w-12 text-right">{x.loadPercent === null ? "-" : `${x.loadPercent} %`}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {w.backlog.jobs.length ? (
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium">Chantiers à planifier</summary>
            <ul className="mt-2 space-y-1">
              {w.backlog.jobs.map((j) => (
                <li key={j.id} className="flex justify-between gap-2">
                  <Link href={`/app/chantiers/${j.id}`} className="link inline-flex min-h-6 items-center">
                    {j.title}
                  </Link>
                  <span className="tabular text-muted">{j.days ? `${j.days.toLocaleString("fr-FR")} j` : "non chiffré"}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Section>

      <Section
        title="Saisonnalité"
        description={
          w.monthsObserved >= 12
            ? `Montant signé moyen de chaque mois sur ${w.monthsObserved} mois, comparé à un mois ordinaire (100).`
            : "Il faut au moins douze mois d'activité dans l'application pour dégager une saisonnalité."
        }
      >
        {w.monthsObserved >= 12 ? (
          <>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="Indice saisonnier par mois">
              {w.seasonality.map((v, m) => (
                <li key={m} className="rounded-md border border-line p-2 text-sm">
                  <div className="text-muted">{MONTH_NAMES[m]}</div>
                  <div className="tabular font-medium">{v ?? "-"}</div>
                  <span className="mt-1 block h-1.5 rounded-full bg-surface-2" aria-hidden="true">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(((v ?? 0) * 100) / max)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              {p.high.length ? `Mois forts : ${p.high.join(", ").toLowerCase()}. ` : ""}
              {p.low.length ? `Mois calmes : ${p.low.join(", ").toLowerCase()} : le bon moment pour relancer d'anciens clients ou planifier les congés.` : ""}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">
            {w.monthsObserved} mois observé{w.monthsObserved > 1 ? "s" : ""} pour l&apos;instant.
          </p>
        )}
      </Section>
    </div>
  );
}
