import Link from "next/link";
import { Icon } from "@/components/Icon";
import { PageHeader, Section } from "@/components/ui";
import { requirePageCtx } from "@/lib/server/session";
import { addDays, mondayOf } from "@/lib/services/planning-dates";
import { parisDate } from "@/lib/services/quotes";
import { listMembers } from "@/lib/services/team";
import { formatMinutes, weekDays } from "@/lib/services/timesheet-calc";
import { ENTRY_STATUSES, listEntries, payroll, pointableJobs, runningEntry } from "@/lib/services/timesheets";
import { DeleteEntry, EntryForm, ReviewList, TimerCard } from "./TimeForms";

export const metadata = { title: "Pointage" };

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const hhmm = (d: Date) => d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export default async function TimesheetPage({ searchParams }: { searchParams: Promise<{ semaine?: string; vue?: string; mois?: string }> }) {
  const sp = await searchParams;
  const ctx = await requirePageCtx();
  const admin = ctx.role !== "member";
  const team = admin && sp.vue === "equipe";
  const today = parisDate(new Date());
  const monday = mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.semaine ?? "") ? sp.semaine! : today);
  const sunday = addDays(monday, 6);
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  const [running, jobs, entries, members] = await Promise.all([
    runningEntry(ctx),
    pointableJobs(ctx, today),
    listEntries(ctx, { from: monday, to: sunday, userId: team ? undefined : ctx.userId }),
    admin ? listMembers(ctx) : Promise.resolve([]),
  ]);
  const link = (week: string) => `/app/pointage?${team ? "vue=equipe&" : ""}semaine=${week}`;
  const days = weekDays(monday);
  const total = entries.reduce((a, e) => a + e.minutes, 0);
  const month = /^\d{4}-\d{2}$/.test(sp.mois ?? "") ? sp.mois! : today.slice(0, 7);
  const recap = team ? await payroll(ctx, month) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Pointage"
        subtitle={`Semaine du ${dayLabel(monday)} : ${formatMinutes(total)}${team ? " pour l'équipe" : ""}`}
        actions={
          <>
            <Link className="btn-secondary px-2" href={link(addDays(monday, -7))} aria-label="Semaine précédente">
              <Icon name="left" size={16} />
            </Link>
            <Link className="btn-secondary" href={link(mondayOf(today))}>
              Cette semaine
            </Link>
            <Link className="btn-secondary px-2" href={link(addDays(monday, 7))} aria-label="Semaine suivante">
              <Icon name="right" size={16} />
            </Link>
            {admin ? (
              <>
                <Link
                  className={team ? "btn-secondary" : "btn-primary"}
                  href={`/app/pointage?semaine=${monday}`}
                  aria-current={team ? undefined : "page"}
                >
                  Mes heures
                </Link>
                <Link
                  className={team ? "btn-primary" : "btn-secondary"}
                  href={`/app/pointage?vue=equipe&semaine=${monday}`}
                  aria-current={team ? "page" : undefined}
                >
                  Équipe
                </Link>
              </>
            ) : null}
          </>
        }
      />

      {!team ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <TimerCard
            canEdit={canEdit}
            jobs={jobs.map((j) => ({ id: j.id, title: j.planned ? `${j.title} (prévu aujourd'hui)` : j.title }))}
            running={
              running?.started_at
                ? {
                    since: new Date(running.started_at).toISOString(),
                    startLabel: hhmm(new Date(running.started_at)),
                    jobTitle: running.job_title ?? "",
                  }
                : null
            }
          />
          {canEdit ? (
            <Section title="Saisir des heures" description="Pour une journée déjà passée ou un oubli de pointage.">
              <EntryForm jobs={jobs} members={null} today={today} />
            </Section>
          ) : null}
        </div>
      ) : null}

      {team ? (
        <>
          <Section
            title="Heures de la semaine à valider"
            description="Une heure validée n'est plus modifiable par la personne ; elle part dans l'export de paie."
          >
            {entries.length ? (
              <ReviewList
                rows={entries
                  .filter((e) => !(e.started_at && !e.ended_at))
                  .map((e) => ({
                    id: e.id,
                    label: `${e.user_name} : ${formatMinutes(e.minutes)}, ${dayLabel(e.work_date)}`,
                    detail: [e.job_title ?? "Sans chantier", e.note, e.review_note ? `Refus : ${e.review_note}` : ""].filter(Boolean).join(" · "),
                    status: e.status,
                    statusLabel: ENTRY_STATUSES[e.status],
                  }))}
              />
            ) : (
              <p className="text-sm text-muted">Aucune heure pointée cette semaine.</p>
            )}
          </Section>
          {canEdit ? (
            <Section title="Saisir pour un membre de l'équipe">
              <EntryForm jobs={jobs} members={members.map((m) => ({ id: m.user_id, name: m.name }))} today={today} />
            </Section>
          ) : null}
          <Section
            title="Export vers la paie"
            description="Heures validées du mois par salarié, avec heures supplémentaires calculées par semaine : 25 % de la 36e à la 43e heure, 50 % au-delà."
          >
            <form className="mb-4 flex flex-wrap items-end gap-2" action="/app/pointage">
              <input type="hidden" name="vue" value="equipe" />
              <input type="hidden" name="semaine" value={monday} />
              <div>
                <label className="label" htmlFor="pay-month">
                  Mois
                </label>
                <input id="pay-month" name="mois" type="month" className="field" defaultValue={month} />
              </div>
              <button className="btn-secondary">Afficher</button>
              <a className="btn-primary" href={`/api/timesheets/export?mois=${month}`}>
                <Icon name="download" size={16} /> Récapitulatif paie (CSV)
              </a>
              <a className="btn-secondary" href={`/api/timesheets/export?mois=${month}&type=detail`}>
                <Icon name="download" size={16} /> Détail (CSV)
              </a>
            </form>
            {recap.length ? (
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Récapitulatif mensuel des heures">
                <table className="w-full text-sm">
                  <thead className="table-head">
                    <tr>
                      <th className="px-3 py-2">Salarié</th>
                      <th className="px-3 py-2 text-right">Jours</th>
                      <th className="px-3 py-2 text-right">Normales</th>
                      <th className="px-3 py-2 text-right">Sup. 25 %</th>
                      <th className="px-3 py-2 text-right">Sup. 50 %</th>
                      <th className="px-3 py-2 text-right">Total validé</th>
                      <th className="px-3 py-2 text-right">À valider</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recap.map((r) => (
                      <tr key={r.userId} className="border-b border-line last:border-0">
                        <td className="px-3 py-2">
                          {r.name}
                          {r.qualification ? <span className="block text-xs text-muted">{r.qualification}</span> : null}
                        </td>
                        <td className="tabular px-3 py-2 text-right">{r.days}</td>
                        <td className="tabular px-3 py-2 text-right">{formatMinutes(r.normal)}</td>
                        <td className="tabular px-3 py-2 text-right">{formatMinutes(r.hs25)}</td>
                        <td className="tabular px-3 py-2 text-right">{formatMinutes(r.hs50)}</td>
                        <td className="tabular px-3 py-2 text-right font-medium">{formatMinutes(r.minutes)}</td>
                        <td className={`tabular px-3 py-2 text-right ${r.pending ? "text-warning" : ""}`}>{formatMinutes(r.pending)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">Aucune heure ce mois-ci.</p>
            )}
          </Section>
        </>
      ) : (
        <Section title="Mes heures de la semaine">
          <ul className="divide-y divide-line text-sm">
            {days.map((d) => {
              const list = entries.filter((e) => e.work_date === d);
              const sum = list.reduce((a, e) => a + e.minutes, 0);
              return (
                <li key={d} className="py-2">
                  <div className="flex justify-between font-medium">
                    <span className={d === today ? "text-accent" : ""}>{dayLabel(d)}</span>
                    <span className="tabular">{sum ? formatMinutes(sum) : ""}</span>
                  </div>
                  {list.map((e) => (
                    <div key={e.id} className="mt-1 flex items-center justify-between gap-2 pl-3 text-muted">
                      <span className="min-w-0 truncate">
                        {e.started_at ? `${hhmm(new Date(e.started_at))} à ${e.ended_at ? hhmm(new Date(e.ended_at)) : "en cours"} · ` : ""}
                        {e.job_title ?? "Sans chantier"}
                        {e.note ? ` · ${e.note}` : ""}
                        {e.review_note ? ` · Refus : ${e.review_note}` : ""}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="tabular">{formatMinutes(e.minutes)}</span>
                        <span className={e.status === "valide" ? "text-success" : e.status === "refuse" ? "text-danger" : "text-warning"}>
                          {ENTRY_STATUSES[e.status]}
                        </span>
                        {canEdit && e.status !== "valide" ? <DeleteEntry id={e.id} label={`le pointage du ${dayLabel(d)}`} /> : null}
                      </span>
                    </div>
                  ))}
                </li>
              );
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
