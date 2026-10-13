/** Rapport mensuel envoyé par e-mail au gérant de chaque entreprise, la première semaine du mois. */

import { num, one, type Database, type Queryable } from "@/lib/db";
import { buildMonthlyReport, previousMonth, type MonthFigures, type MonthlyReportInput } from "@/lib/monthly-report";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { appUrl, sendMail } from "./mail";
import { parisDate } from "./quotes";
import { getReport } from "./reports";

/** Au-delà du 7 du mois, le rapport du mois précédent n'est plus envoyé (serveur arrêté, rattrapage). */
export const SEND_UNTIL_DAY = 7;

export async function monthlyReportData(q: Queryable, orgId: string, now = new Date()): Promise<MonthlyReportInput> {
  const db = q as Database;
  const report = await getReport({ db, orgId }, 14, now);
  const pick = (i: number): MonthFigures | null => {
    const m = report.months[report.months.length - 1 - i];
    return m ? { ...m } : null;
  };
  const [org, overdue, jobs] = await Promise.all([
    one<{ trade_name: string; legal_name: string }>(q, "SELECT trade_name, legal_name FROM organizations WHERE id=$1", [orgId]),
    one<{ n: unknown; c: unknown }>(
      q,
      `SELECT count(*) AS n, coalesce(sum(amount_due_cents - paid_cents - credited_cents), 0) AS c FROM invoices
       WHERE org_id=$1 AND kind <> 'credit_note' AND due_date < $2 AND amount_due_cents > paid_cents + credited_cents`,
      [orgId, parisDate(now)],
    ),
    one<{ n: unknown }>(q, "SELECT count(*) AS n FROM jobs WHERE org_id=$1 AND status='en_cours'", [orgId]),
  ]);
  return {
    orgName: org?.trade_name || org?.legal_name || "",
    current: pick(1)!,
    previous: pick(2),
    lastYear: pick(13),
    goalSignedHtCents: report.goals.monthlySignedHtCents,
    pendingQuotesTtcCents: report.pendingTtcCents,
    overdue: { count: num(overdue?.n), cents: num(overdue?.c) },
    activeJobs: num(jobs?.n),
    appUrl: appUrl("/app/rapports"),
  };
}

export async function getMonthlyReportSetting(ctx: Ctx): Promise<boolean> {
  const r = await one<{ monthly_report_enabled: boolean }>(ctx.db, "SELECT monthly_report_enabled FROM organizations WHERE id=$1", [ctx.orgId]);
  return Boolean(r?.monthly_report_enabled);
}

export async function setMonthlyReport(ctx: Ctx, enabled: boolean) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  await ctx.db.query("UPDATE organizations SET monthly_report_enabled=$2 WHERE id=$1", [ctx.orgId, enabled]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "organization.monthly_report", data: { enabled }, ip: ctx.ip });
}

/** Envoie à chaque gérant le rapport du mois écoulé, une seule fois par mois et par entreprise. */
export async function runMonthlyReports(db: Database, now = new Date()) {
  const today = parisDate(now);
  if (Number(today.slice(8, 10)) > SEND_UNTIL_DAY) return { sent: 0 };
  const month = previousMonth(today);
  const orgs = await db.query<{ id: string }>(
    `SELECT id FROM organizations WHERE status='active' AND monthly_report_enabled AND monthly_report_sent <> $1
       AND created_at < ($1 || '-01')::date + interval '1 month' LIMIT 500`,
    [month],
  );
  let sent = 0;
  for (const o of orgs) {
    const owners = await db.query<{ email: string }>(
      "SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 AND m.role='owner' AND u.email <> ''",
      [o.id],
    );
    const mail = buildMonthlyReport(await monthlyReportData(db, o.id, now));
    for (const w of owners) {
      await sendMail(db, {
        orgId: o.id,
        kind: "monthly_report",
        to: w.email,
        subject: mail.subject,
        body: mail.body,
        idempotencyKey: `monthly-report:${o.id}:${month}:${w.email}`,
      });
      sent++;
    }
    await db.query("UPDATE organizations SET monthly_report_sent=$2 WHERE id=$1", [o.id, month]);
  }
  return { sent };
}
