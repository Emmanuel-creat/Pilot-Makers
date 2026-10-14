/** Contrôles mensuels de la comptabilité et marquage des mois vérifiés. */

import { num } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { MONTH_CHECKS, fiscalMonths, monthChecks, monthLabel, monthState, yearProgress, type MonthCounts, type MonthReview } from "@/lib/continuous-accounting";
import { fiscalYear } from "@/lib/year-end";
import type { Ctx } from "./context";
import { audit, requirePermission } from "./context";
import { parisDate } from "./quotes";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

async function countsByMonth(ctx: Ctx, from: string, to: string): Promise<Map<string, MonthCounts>> {
  const [bank, expenses] = await Promise.all([
    ctx.db.query<{ m: string; lines: unknown; unmatched: unknown }>(
      `SELECT to_char(booked_on, 'YYYY-MM') AS m, count(*) AS lines, count(*) FILTER (WHERE status='a_rapprocher') AS unmatched
         FROM bank_transactions WHERE org_id=$1 AND booked_on BETWEEN $2 AND $3 GROUP BY 1`,
      [ctx.orgId, from, to],
    ),
    ctx.db.query<{ m: string; pending: unknown; missing: unknown }>(
      `SELECT to_char(expense_date, 'YYYY-MM') AS m, count(*) FILTER (WHERE status='soumis') AS pending,
              count(*) FILTER (WHERE status <> 'refuse' AND photo IS NULL) AS missing
         FROM expenses WHERE org_id=$1 AND expense_date BETWEEN $2 AND $3 GROUP BY 1`,
      [ctx.orgId, from, to],
    ),
  ]);
  const map = new Map<string, MonthCounts>();
  const get = (m: string) => map.get(m) ?? map.set(m, { bankLines: 0, unmatched: 0, pendingExpenses: 0, missingReceipts: 0 }).get(m)!;
  for (const r of bank) Object.assign(get(r.m), { bankLines: num(r.lines), unmatched: num(r.unmatched) });
  for (const r of expenses) Object.assign(get(r.m), { pendingExpenses: num(r.pending), missingReceipts: num(r.missing) });
  return map;
}

/** Tableau de l'exercice : chaque mois, ses contrôles, son état et sa vérification. */
export async function continuousAccounting(ctx: Ctx, year: number, now = new Date()) {
  requirePermission(ctx, "billing");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Exercice invalide");
  const { from, to } = fiscalYear(year);
  const today = parisDate(now);
  const [counts, reviews] = await Promise.all([
    countsByMonth(ctx, from, to),
    ctx.db.query<{ month: string; verified_at: Date; vat_declared: boolean; note: string }>(
      "SELECT month, verified_at, vat_declared, note FROM accounting_months WHERE org_id=$1 AND month BETWEEN $2 AND $3",
      [ctx.orgId, from.slice(0, 7), to.slice(0, 7)],
    ),
  ]);
  const byMonth = new Map<string, MonthReview>(reviews.map((r) => [r.month, { verifiedAt: r.verified_at, vatDeclared: r.vat_declared, note: r.note }]));
  const months = fiscalMonths(from, to).map((month) => {
    const checks = monthChecks(counts.get(month) ?? { bankLines: 0, unmatched: 0, pendingExpenses: 0, missingReceipts: 0 });
    const review = byMonth.get(month) ?? null;
    return { month, label: monthLabel(month), checks, review, state: monthState(month, today, checks, review) };
  });
  return { from, to, months, progress: yearProgress(months.map((m) => m.state)) };
}

/** Marque un mois terminé comme vérifié ; refusé tant qu'un contrôle signale une anomalie. */
export async function verifyMonth(ctx: Ctx, month: string, input: { vatDeclared: boolean; note: string }, now = new Date()) {
  requirePermission(ctx, "billing");
  if (!MONTH.test(month)) throw badRequest("Mois invalide");
  if (month >= parisDate(now).slice(0, 7)) throw badRequest("Un mois se vérifie une fois terminé");
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const counts = (await countsByMonth(ctx, `${month}-01`, last)).get(month) ?? { bankLines: 0, unmatched: 0, pendingExpenses: 0, missingReceipts: 0 };
  const failing = monthChecks(counts).filter((c) => !c.ok);
  if (failing.length) {
    throw badRequest(
      `À reprendre avant de vérifier ${monthLabel(month)} : ${failing.map((f) => MONTH_CHECKS.find((c) => c.id === f.id)!.fix.toLowerCase()).join(", ")}`,
    );
  }
  await ctx.db.query(
    `INSERT INTO accounting_months (org_id, month, verified_at, verified_by, vat_declared, note) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (org_id, month) DO UPDATE SET verified_at=EXCLUDED.verified_at, verified_by=EXCLUDED.verified_by,
       vat_declared=EXCLUDED.vat_declared, note=EXCLUDED.note`,
    [ctx.orgId, month, now, ctx.userId, input.vatDeclared, input.note.trim().slice(0, 500)],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "accounting.month_verified", target: month });
}

/** Rouvre un mois (pièce oubliée, correction) : il devra être vérifié à nouveau. */
export async function reopenMonth(ctx: Ctx, month: string) {
  requirePermission(ctx, "billing");
  if (!MONTH.test(month)) throw badRequest("Mois invalide");
  await ctx.db.query("DELETE FROM accounting_months WHERE org_id=$1 AND month=$2", [ctx.orgId, month]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "accounting.month_reopened", target: month });
}
