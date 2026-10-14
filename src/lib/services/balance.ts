/** Équilibre de charge de l'équipe sur les quatre semaines à venir, à partir du planning et des absences. */

import { personLoads, spread, suggestions, workingDays, type BalanceAssignment, type BalancePerson } from "@/lib/balance";
import { listAbsences } from "./absences";
import type { Ctx } from "./context";
import { requirePermission } from "./context";
import { addDays } from "./planning-dates";
import { parisDate } from "./quotes";

export const BALANCE_WEEKS = 4;

const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export async function teamBalance(ctx: Ctx, now = new Date()) {
  requirePermission(ctx, "staff");
  const today = parisDate(now);
  const end = addDays(today, BALANCE_WEEKS * 7 - 1);
  const days = workingDays(today, end);
  const [members, rows, absences] = await Promise.all([
    ctx.db.query<{ id: string; name: string }>(
      `SELECT u.id, coalesce(nullif(u.name, ''), u.email) AS name FROM memberships m JOIN users u ON u.id=m.user_id
        WHERE m.org_id=$1 AND (m.job_function IS NULL OR m.job_function <> 'comptable') ORDER BY 2`,
      [ctx.orgId],
    ),
    ctx.db.query<{ id: string; title: string; resource_id: string; start_date: unknown; end_date: unknown }>(
      `SELECT a.id, j.title, a.resource_id, a.start_date, a.end_date FROM job_assignments a JOIN jobs j ON j.id=a.job_id
        WHERE a.org_id=$1 AND a.resource_type='user' AND a.start_date <= $3 AND a.end_date >= $2 ORDER BY a.start_date`,
      [ctx.orgId, today, end],
    ),
    listAbsences(ctx, today, end),
  ]);
  const people: BalancePerson[] = members.map((m) => {
    const absent = new Set<string>();
    for (const a of absences) if (a.userId === m.id) for (let d = a.start; d <= a.end; d = addDays(d, 1)) absent.add(d);
    return { id: m.id, name: m.name, absent };
  });
  const team = new Set(members.map((m) => m.id));
  const assignments: BalanceAssignment[] = rows
    .filter((r) => team.has(r.resource_id))
    .map((r) => ({ id: r.id, jobTitle: r.title, userId: r.resource_id, start: iso(r.start_date), end: iso(r.end_date) }));
  const loads = personLoads(days, people, assignments);
  return {
    from: today,
    to: end,
    loads,
    spread: spread(loads),
    overloaded: loads.filter((l) => l.status === "surcharge").length,
    suggestions: suggestions(days, people, assignments, today),
  };
}
