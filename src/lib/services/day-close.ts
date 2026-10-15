/** Fin de journée : ce qui reste à boucler avant 18 heures, et le rappel de 16 h 30. */

import type { Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { type DayCloseFacts, dayCloseItems, parisClock, reminderDue } from "@/lib/day-close";
import type { Ctx } from "./context";
import { can } from "./context";
import { notifyUsers } from "./push";

async function facts(q: Queryable, orgId: string, userId: string, billing: boolean, today: string): Promise<DayCloseFacts> {
  const r = await one<Record<string, unknown>>(
    q,
    `SELECT
       EXISTS (SELECT 1 FROM job_assignments a WHERE a.org_id=$1 AND a.resource_type='user' AND a.resource_id=$2 AND a.start_date <= $3::date AND a.end_date >= $3::date) AS assigned,
       (SELECT coalesce(sum(minutes), 0) FROM time_entries WHERE org_id=$1 AND user_id=$2 AND work_date=$3::date) AS minutes,
       (SELECT count(*) FROM quotes WHERE org_id=$1 AND status IN ('draft', 'incomplete') AND archived_at IS NULL
          AND (updated_at AT TIME ZONE 'Europe/Paris')::date = $3::date) AS drafts,
       (SELECT count(*) FROM payment_stages WHERE org_id=$1 AND status='validee' AND invoice_id IS NULL) AS stages,
       (SELECT count(*) FROM jobs j WHERE j.org_id=$1 AND j.status='receptionne' AND j.quote_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.quote_id=j.quote_id AND i.kind='final')) AS received,
       (SELECT count(*) FROM leads WHERE org_id=$1 AND status='nouvelle' AND created_at < now() - interval '1 day') AS leads,
       (SELECT count(*) FROM expenses WHERE org_id=$1 AND user_id=$2 AND photo IS NULL AND expense_date >= $3::date - 7) AS expenses`,
    [orgId, userId, today],
  );
  return {
    assignedToday: !!r?.assigned,
    minutesToday: num(r?.minutes),
    draftsTouchedToday: num(r?.drafts),
    validatedStagesToInvoice: billing ? num(r?.stages) : 0,
    receivedJobsWithoutFinalInvoice: billing ? num(r?.received) : 0,
    leadsWaiting: num(r?.leads),
    expensesWithoutReceipt: num(r?.expenses),
  };
}

export async function myDayClose(ctx: Ctx, now = new Date()) {
  const { today, minutes } = parisClock(now);
  const items = dayCloseItems(await facts(ctx.db, ctx.orgId, ctx.userId, can(ctx, "billing"), today));
  const m = await one<{ day_close_reminder: boolean }>(ctx.db, "SELECT day_close_reminder FROM memberships WHERE org_id=$1 AND user_id=$2", [
    ctx.orgId,
    ctx.userId,
  ]);
  return {
    items,
    minutesLeft: items.reduce((s, i) => s + i.minutes, 0),
    nowMinutes: minutes,
    reminder: !!m?.day_close_reminder,
  };
}

export async function setDayCloseReminder(ctx: Ctx, on: boolean) {
  await ctx.db.query("UPDATE memberships SET day_close_reminder=$3 WHERE org_id=$1 AND user_id=$2", [ctx.orgId, ctx.userId, on]);
}

/** Tâche planifiée : rappel à 16 h 30 pour ceux qui l'ont demandé et à qui il reste quelque chose. */
export async function runDayCloseReminders(db: Queryable, now = new Date()) {
  const { today, minutes } = parisClock(now);
  if (!reminderDue(minutes, null, today)) return { sent: 0 };
  const members = await db.query<{ org_id: string; user_id: string; role: string; job_function: string | null; sent_on: unknown }>(
    "SELECT org_id, user_id, role, job_function, day_close_sent_on AS sent_on FROM memberships WHERE day_close_reminder",
  );
  let sent = 0;
  for (const m of members) {
    const sentOn = m.sent_on == null ? null : (m.sent_on instanceof Date ? m.sent_on.toISOString() : String(m.sent_on)).slice(0, 10);
    if (!reminderDue(minutes, sentOn, today)) continue;
    const billing = can({ role: m.role, jobFunction: m.job_function } as never, "billing");
    const items = dayCloseItems(await facts(db, m.org_id, m.user_id, billing, today));
    await db.query("UPDATE memberships SET day_close_sent_on=$3 WHERE org_id=$1 AND user_id=$2", [m.org_id, m.user_id, today]);
    if (!items.length) continue;
    const total = items.reduce((s, i) => s + i.minutes, 0);
    await notifyUsers(db, m.org_id, [m.user_id], {
      title: "Fin de journée",
      body: `${items.length} point${items.length > 1 ? "s" : ""} à boucler avant 18 h, environ ${total} minute${total > 1 ? "s" : ""}.`,
      url: "/app/fin-de-journee",
    });
    sent += 1;
  }
  return { sent };
}
