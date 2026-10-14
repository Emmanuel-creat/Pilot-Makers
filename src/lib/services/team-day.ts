/** Écran « Ma journée » des équipes : langue de l'écran, chantiers du jour de la personne, pointage et heures. */

import { badRequest } from "@/lib/http";
import { isTeamLocale } from "@/lib/i18n/team";
import type { Ctx } from "./context";
import { addDays, mondayOf } from "./planning-dates";
import { parisDate } from "./quotes";
import { listEntries, pointableJobs, runningEntry } from "./timesheets";

export async function teamLocale(ctx: Ctx): Promise<string> {
  const [r] = await ctx.db.query<{ team_locale: string }>("SELECT team_locale FROM users WHERE id=$1", [ctx.userId]);
  return r?.team_locale ?? "fr";
}

export async function setTeamLocale(ctx: Ctx, locale: unknown) {
  if (!isTeamLocale(locale)) throw badRequest("Langue inconnue");
  await ctx.db.query("UPDATE users SET team_locale=$2 WHERE id=$1", [ctx.userId, locale]);
}

export async function myDay(ctx: Ctx, now = new Date()) {
  const today = parisDate(now);
  const monday = mondayOf(today);
  const [locale, assigned, running, jobs, entries] = await Promise.all([
    teamLocale(ctx),
    ctx.db.query<{ id: string; title: string; line1: string; postal_code: string; city: string; teammates: string[] | null }>(
      `SELECT j.id, j.title, j.site_line1 AS line1, j.site_postal_code AS postal_code, j.site_city AS city,
         (SELECT array_agg(coalesce(nullif(u.name, ''), u.email) ORDER BY u.name) FROM job_assignments b JOIN users u ON u.id=b.resource_id
           WHERE b.job_id=j.id AND b.resource_type='user' AND b.resource_id <> $2 AND $3::date BETWEEN b.start_date AND b.end_date) AS teammates
       FROM jobs j WHERE j.org_id=$1 AND EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id=j.id AND a.resource_type='user' AND a.resource_id=$2
         AND $3::date BETWEEN a.start_date AND a.end_date)
       ORDER BY lower(j.title)`,
      [ctx.orgId, ctx.userId, today],
    ),
    runningEntry(ctx),
    pointableJobs(ctx, today),
    listEntries(ctx, { from: monday, to: addDays(monday, 6), userId: ctx.userId }),
  ]);
  return {
    locale,
    today,
    jobs: assigned.map((j) => ({
      id: j.id,
      title: j.title,
      address: [j.line1, [j.postal_code, j.city].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      teammates: j.teammates ?? [],
    })),
    running,
    pointable: jobs,
    entries: entries.filter((e) => e.user_id === ctx.userId),
    weekMinutes: entries.filter((e) => e.user_id === ctx.userId).reduce((s, e) => s + e.minutes, 0),
  };
}
