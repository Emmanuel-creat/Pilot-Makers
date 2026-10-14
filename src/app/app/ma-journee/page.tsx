import Link from "next/link";
import { teamLocaleAction } from "@/app/actions";
import { ActionForm } from "@/components/forms/ActionForm";
import { Submit } from "@/components/forms/Submit";
import { Icon } from "@/components/Icon";
import { isTeamLocale, TEAM_LOCALES, teamText } from "@/lib/i18n/team";
import { requirePageCtx } from "@/lib/server/session";
import { myDay } from "@/lib/services/team-day";
import { formatMinutes } from "@/lib/services/timesheet-calc";
import { TeamTimer } from "./TeamTimer";

export const metadata = { title: "Ma journée" };

/** Écran simple des équipes de chantier, dans la langue choisie par chacun. */
export default async function MyDayPage() {
  const ctx = await requirePageCtx();
  const d = await myDay(ctx);
  const locale = isTeamLocale(d.locale) ? d.locale : "fr";
  const t = teamText(locale);
  const { intl, dir } = TEAM_LOCALES[locale];
  const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(intl, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const hhmm = (v: Date) => v.toLocaleTimeString(intl, { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });
  const canEdit = !ctx.entitlements.readOnly && !ctx.supportAccess;
  return (
    <div className="mx-auto max-w-2xl space-y-6" lang={intl} dir={dir}>
      <div>
        <h1 className="text-2xl font-semibold" data-testid="titre-ma-journee">
          {t.title}
        </h1>
        <p className="text-sm text-muted">
          {day(d.today)}. {t.subtitle}
        </p>
      </div>
      <ActionForm action={teamLocaleAction} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="mj-locale">
            {t.language}
          </label>
          <select id="mj-locale" name="locale" className="field" defaultValue={locale}>
            {Object.entries(TEAM_LOCALES).map(([k, l]) => (
              <option key={k} value={k} lang={l.intl}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <Submit className="btn-secondary">{t.change}</Submit>
      </ActionForm>

      <section className="card p-4" aria-labelledby="mj-chantiers">
        <h2 id="mj-chantiers" className="mb-3 flex items-center gap-2 font-semibold">
          <Icon name="truck" size={18} /> {t.jobsToday}
        </h2>
        {d.jobs.length ? (
          <ul className="divide-y divide-line">
            {d.jobs.map((j) => (
              <li key={j.id} className="space-y-1 py-3">
                <Link href={`/app/chantiers/${j.id}`} className="link text-base font-medium" lang="fr">
                  {j.title}
                </Link>
                {j.address ? (
                  <div className="text-sm">
                    <span lang="fr">{j.address}</span>{" "}
                    <a
                      className="link inline-flex min-h-6 items-center gap-1"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(j.address)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Icon name="pin" size={14} /> {t.itinerary}
                    </a>
                  </div>
                ) : null}
                {j.teammates.length ? (
                  <div className="text-sm text-muted">
                    {t.with} : {j.teammates.join(", ")}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t.noJobs}</p>
        )}
      </section>

      <TeamTimer
        t={t}
        canEdit={canEdit}
        jobs={d.pointable.map((j) => ({ id: j.id, title: j.title }))}
        running={
          d.running?.started_at
            ? { since: new Date(d.running.started_at).toISOString(), startLabel: hhmm(new Date(d.running.started_at)), jobTitle: d.running.job_title ?? "" }
            : null
        }
      />

      <section className="card p-4" aria-labelledby="mj-heures">
        <h2 id="mj-heures" className="mb-3 flex items-center gap-2 font-semibold">
          <Icon name="clock" size={18} /> {t.weekHours}
        </h2>
        {d.entries.length ? (
          <ul className="divide-y divide-line text-sm" data-testid="mj-heures">
            {d.entries.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>
                  {day(e.work_date)}
                  <span className="block text-xs text-muted" lang="fr">
                    {e.job_title ?? t.noJob}
                  </span>
                </span>
                <span className="tabular text-right">
                  {formatMinutes(e.minutes)}
                  <span className="block text-xs text-muted">{t.status[e.status]}</span>
                </span>
              </li>
            ))}
            <li className="flex justify-between py-2 font-semibold">
              <span>{t.total}</span>
              <span className="tabular">{formatMinutes(d.weekMinutes)}</span>
            </li>
          </ul>
        ) : (
          <p className="text-sm text-muted">{t.noHours}</p>
        )}
      </section>

      <section className="card p-4" aria-labelledby="mj-securite">
        <h2 id="mj-securite" className="mb-2 flex items-center gap-2 font-semibold">
          <Icon name="shield" size={18} /> {t.safetyTitle}
        </h2>
        <ul className="list-disc space-y-1 ps-5 text-sm">
          {t.safety.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </section>

      <Link href="/app" className="link inline-flex min-h-6 items-center text-sm">
        {t.fullApp}
      </Link>
    </div>
  );
}
