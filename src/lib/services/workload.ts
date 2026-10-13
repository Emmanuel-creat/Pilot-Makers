/** Saisonnalité des signatures et prévision de charge de l'équipe sur les semaines à venir. */

import { num } from "@/lib/db";
import { forecast, remainingLabourDays, seasonality, type WeekLoad } from "@/lib/workload";
import { listAbsences } from "./absences";
import type { Ctx } from "./context";
import { requirePermission } from "./context";
import { addDays, mondayOf } from "./planning-dates";
import { parisDate } from "./quotes";
import { getReport } from "./reports";

export const FORECAST_WEEKS = 12;

export interface Workload {
  team: number;
  weeks: WeekLoad[];
  backlog: { jobs: { id: string; title: string; days: number }[]; days: number; unknown: number };
  overflowDays: number;
  firstFree: string | null;
  seasonality: (number | null)[];
  monthsObserved: number;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const weekdays = (monday: string) => [0, 1, 2, 3, 4].map((i) => addDays(monday, i));

export async function workload(ctx: Ctx, now = new Date()): Promise<Workload> {
  requirePermission(ctx, "billing");
  const start = mondayOf(parisDate(now));
  const end = addDays(start, FORECAST_WEEKS * 7 - 1);
  const [members, assignments, absences, jobs, report] = await Promise.all([
    ctx.db.query<{ user_id: string }>("SELECT user_id FROM memberships WHERE org_id=$1 AND (job_function IS NULL OR job_function <> 'comptable')", [ctx.orgId]),
    ctx.db.query<{ resource_id: string; start_date: unknown; end_date: unknown }>(
      "SELECT resource_id, start_date, end_date FROM job_assignments WHERE org_id=$1 AND resource_type='user' AND start_date <= $3 AND end_date >= $2",
      [ctx.orgId, start, end],
    ),
    listAbsences(ctx, start, end),
    ctx.db.query<{ id: string; title: string }>(
      `SELECT j.id, j.title FROM jobs j WHERE j.org_id=$1 AND j.status='a_planifier'
         AND NOT EXISTS (SELECT 1 FROM job_assignments a WHERE a.job_id=j.id AND a.resource_type='user') ORDER BY j.created_at`,
      [ctx.orgId],
    ),
    getReport(ctx, 36, now),
  ]);
  const team = new Set(members.map((m) => m.user_id));
  const absent = new Set<string>();
  for (const a of absences) for (let d = a.start; d <= a.end; d = addDays(d, 1)) absent.add(`${a.userId}|${d}`);
  const busy = new Set<string>();
  for (const a of assignments) {
    if (!team.has(a.resource_id)) continue;
    for (let d = iso(a.start_date) < start ? start : iso(a.start_date); d <= iso(a.end_date) && d <= end; d = addDays(d, 1)) busy.add(`${a.resource_id}|${d}`);
  }
  const weeks = Array.from({ length: FORECAST_WEEKS }, (_, i) => {
    const monday = addDays(start, i * 7);
    let capacityDays = 0;
    let plannedDays = 0;
    for (const d of weekdays(monday)) {
      for (const u of team) {
        if (absent.has(`${u}|${d}`)) continue;
        capacityDays++;
        if (busy.has(`${u}|${d}`)) plannedDays++;
      }
    }
    return { monday, capacityDays, plannedDays };
  });

  const tasks = jobs.length
    ? await ctx.db.query<{ job_id: string; nature: string; quantity: string; unit: string; progress_bp: unknown }>(
        "SELECT job_id, nature, quantity, unit, progress_bp FROM job_tasks WHERE org_id=$1 AND job_id = ANY($2::uuid[])",
        [ctx.orgId, jobs.map((j) => j.id)],
      )
    : [];
  const backlogJobs = jobs.map((j) => ({
    id: j.id,
    title: j.title,
    days: remainingLabourDays(
      tasks.filter((t) => t.job_id === j.id).map((t) => ({ nature: t.nature, quantity: t.quantity, unit: t.unit, progressBp: num(t.progress_bp) })),
    ),
  }));
  const backlogDays = Math.round(backlogJobs.reduce((t, j) => t + j.days, 0) * 10) / 10;
  const f = forecast(weeks, backlogDays);
  // Mois complets depuis la première activité : le mois en cours, incomplet, est écarté.
  const full = report.months.slice(0, -1);
  const first = full.findIndex((m) => m.sent > 0 || m.signed > 0);
  const observed = first < 0 ? [] : full.slice(first);
  return {
    team: team.size,
    weeks: f.weeks,
    backlog: { jobs: backlogJobs, days: backlogDays, unknown: backlogJobs.filter((j) => !j.days).length },
    overflowDays: f.overflowDays,
    firstFree: f.firstFree,
    seasonality: seasonality(observed),
    monthsObserved: observed.length,
  };
}
