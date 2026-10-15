/** Heures rendues : décompte des tâches faites par l'application, par entreprise ou pour toutes. */

import type { Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { PUBLIC_MIN_ORGS, type TimeCounts, timeSaved } from "@/lib/time-saved";
import type { Ctx } from "./context";
import { parisDate } from "./quotes";

const PARIS = (col: string) => `(${col} AT TIME ZONE 'Europe/Paris')::date`;

/** Requêtes de décompte ; $1 est un tableau d'entreprises, $2 et $3 les bornes de la période */
const QUERIES: Record<string, string> = {
  devis: `SELECT count(*) FROM quotes WHERE org_id = ANY($1::uuid[]) AND issued_at IS NOT NULL AND ${PARIS("issued_at")} BETWEEN $2 AND $3`,
  factures: "SELECT count(*) FROM invoices WHERE org_id = ANY($1::uuid[]) AND issue_date BETWEEN $2 AND $3",
  relances_devis: `SELECT count(*) FROM emails WHERE org_id = ANY($1::uuid[]) AND kind='reminder' AND ${PARIS("created_at")} BETWEEN $2 AND $3`,
  relances_factures: `SELECT count(*) FROM emails WHERE org_id = ANY($1::uuid[]) AND kind='invoice_reminder' AND ${PARIS("created_at")} BETWEEN $2 AND $3`,
  avis_clients: `SELECT count(*) FROM emails WHERE org_id = ANY($1::uuid[]) AND kind IN ('maintenance','delay_notice') AND ${PARIS("created_at")} BETWEEN $2 AND $3`,
  rapprochement: "SELECT count(*) FROM bank_transactions WHERE org_id = ANY($1::uuid[]) AND matched_by='auto' AND booked_on BETWEEN $2 AND $3",
  pointage: "SELECT count(*) FROM time_entries WHERE org_id = ANY($1::uuid[]) AND work_date BETWEEN $2 AND $3",
  commandes: `SELECT count(*) FROM purchase_orders WHERE org_id = ANY($1::uuid[]) AND status <> 'annule' AND ${PARIS("created_at")} BETWEEN $2 AND $3`,
  remises: "SELECT count(*) FROM cheque_deposits WHERE org_id = ANY($1::uuid[]) AND cheque_count > 0 AND deposited_on BETWEEN $2 AND $3",
};

async function counts(db: Queryable, orgIds: string[], from: string, to: string): Promise<TimeCounts> {
  const out: TimeCounts = {};
  for (const [k, sql] of Object.entries(QUERIES)) out[k] = num((await one<{ count: unknown }>(db, sql, [orgIds, from, to]))?.count);
  return out;
}

const startOfMonth = (d: string) => `${d.slice(0, 7)}-01`;
const startOfYear = (d: string) => `${d.slice(0, 4)}-01-01`;

/** Temps rendu à l'entreprise ce mois-ci et depuis le début de l'année */
export async function myTimeSaved(ctx: Ctx, now = new Date()) {
  const today = parisDate(now);
  const [month, year] = await Promise.all([
    counts(ctx.db, [ctx.orgId], startOfMonth(today), today).then(timeSaved),
    counts(ctx.db, [ctx.orgId], startOfYear(today), today).then(timeSaved),
  ]);
  return { today, month, year };
}

/** Total de toutes les entreprises actives depuis le début de l'année ; rien sous le seuil d'entreprises. */
export async function publicTimeSaved(db: Queryable, now = new Date()) {
  const today = parisDate(now);
  const orgs = await db.query<{ id: string }>("SELECT id FROM organizations WHERE status='active'");
  const from = startOfYear(today);
  if (orgs.length < PUBLIC_MIN_ORGS) return { year: Number(today.slice(0, 4)), from, to: today, organizations: orgs.length, published: false as const };
  const t = timeSaved(
    await counts(
      db,
      orgs.map((o) => o.id),
      from,
      today,
    ),
  );
  return {
    year: Number(today.slice(0, 4)),
    from,
    to: today,
    organizations: orgs.length,
    published: true as const,
    hours: t.hours,
    averageHoursPerOrg: Math.round(t.totalMinutes / 60 / orgs.length),
    lines: t.lines.map(({ key, label, minutes, count, savedMinutes }) => ({ key, label, minutesEach: minutes, count, hours: Math.round(savedMinutes / 60) })),
  };
}
