/** Suivi des garanties et des retenues de garantie des chantiers réceptionnés, avec rappels. */

import { num, type Database } from "@/lib/db";
import { formatEuros } from "@/lib/calc/format";
import { badRequest, conflict, notFound } from "@/lib/http";
import { dueReminders, retentionReleaseDate, retentionState, warrantyPeriods, type RetentionState, type WarrantyPeriod } from "@/lib/warranties";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { notifyOrg } from "./push";
import { parisDate } from "./quotes";

export interface WarrantyRow {
  jobId: string;
  title: string;
  customerName: string;
  receptionDate: string;
  openReserves: number;
  periods: WarrantyPeriod[];
  retention: {
    cents: number;
    state: RetentionState;
    releaseDate: string;
    releasedAt: string | null;
    note: string;
  };
}

const dateOf = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);

/**
 * Retenue effectivement gardée par le client : celle des factures de solde et de situation du devis,
 * moins celle reprise par les avoirs.
 */
const RECEPTIONS_SQL = `
  SELECT r.job_id, r.org_id, r.reception_date, r.retention_released_at, r.retention_release_note, r.reminders_sent, j.title,
    COALESCE(NULLIF(c.company_name, ''), TRIM(c.first_name || ' ' || c.last_name), '') AS customer_name,
    (SELECT count(*) FROM job_reserves x WHERE x.job_id=r.job_id AND x.lifted_at IS NULL) AS open_reserves,
    COALESCE((SELECT SUM(CASE WHEN i.kind='credit_note' THEN -1 ELSE 1 END * COALESCE((i.snapshot->'invoice'->'retention'->>'cents')::bigint, 0))
      FROM invoices i WHERE j.quote_id IS NOT NULL AND i.quote_id=j.quote_id AND i.org_id=r.org_id AND i.kind IN ('final','progress','credit_note')), 0) AS retention_cents
  FROM job_receptions r JOIN jobs j ON j.id=r.job_id LEFT JOIN customers c ON c.id=j.customer_id
  WHERE r.decision <> 'refus'`;

type Raw = Record<string, unknown>;

function toRow(r: Raw, today: string): WarrantyRow {
  const receptionDate = dateOf(r.reception_date);
  const cents = Math.max(0, num(r.retention_cents));
  const releasedAt = r.retention_released_at ? new Date(r.retention_released_at as string).toISOString() : null;
  return {
    jobId: String(r.job_id),
    title: String(r.title ?? ""),
    customerName: String(r.customer_name ?? ""),
    receptionDate,
    openReserves: num(r.open_reserves),
    periods: warrantyPeriods(receptionDate, today),
    retention: {
      cents,
      state: retentionState({ cents, releasedAt, receptionDate, today }),
      releaseDate: retentionReleaseDate(receptionDate),
      releasedAt,
      note: String(r.retention_release_note ?? ""),
    },
  };
}

/** Chantiers réceptionnés, les plus récents d'abord. */
export async function listWarranties(ctx: Ctx, now = new Date()): Promise<WarrantyRow[]> {
  const today = parisDate(now);
  const rows = await ctx.db.query<Raw>(`${RECEPTIONS_SQL} AND r.org_id=$1 ORDER BY r.reception_date DESC LIMIT 500`, [ctx.orgId]);
  return rows.map((r) => toRow(r, today));
}

export async function getWarranty(ctx: Ctx, jobId: string, now = new Date()): Promise<WarrantyRow | null> {
  const rows = await ctx.db.query<Raw>(`${RECEPTIONS_SQL} AND r.org_id=$1 AND r.job_id=$2`, [ctx.orgId, jobId]);
  return rows.length ? toRow(rows[0], parisDate(now)) : null;
}

/** Retenue rendue par le client (versement reçu ou caution bancaire substituée). */
export async function releaseRetention(ctx: Ctx, jobId: string, note: string) {
  requireWritable(ctx);
  const text = String(note ?? "").trim();
  if (text.length > 500) throw badRequest("Commentaire trop long");
  const w = await getWarranty(ctx, jobId);
  if (!w) throw notFound("Aucune réception pour ce chantier");
  if (w.retention.state === "aucune") throw badRequest("Aucune retenue de garantie sur ce chantier");
  if (w.retention.state === "liberee") throw conflict("La retenue de garantie est déjà libérée");
  await ctx.db.query("UPDATE job_receptions SET retention_released_at=now(), retention_release_note=$3 WHERE job_id=$1 AND org_id=$2", [
    jobId,
    ctx.orgId,
    text,
  ]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "job.retention_released", target: jobId, ip: ctx.ip });
}

const frDate = (d: string) => d.split("-").reverse().join("/");

/** Notifications : fin proche du parfait achèvement, retenue à réclamer. Chaque rappel n'est envoyé qu'une fois. */
export async function runWarrantyReminders(db: Database, now = new Date()) {
  const today = parisDate(now);
  const rows = await db.query<Raw>(
    `${RECEPTIONS_SQL} AND r.reception_date >= $1 AND r.reception_date <= $2
       AND EXISTS (SELECT 1 FROM organizations o WHERE o.id=r.org_id AND o.status='active') LIMIT 1000`,
    // Seules les réceptions de 11 mois à 3 ans peuvent déclencher un rappel.
    [dateOf(new Date(now.getTime() - 3 * 366 * 86400000)), dateOf(new Date(now.getTime() - 300 * 86400000))],
  );
  let sent = 0;
  for (const r of rows) {
    const w = toRow(r, today);
    const already = Array.isArray(r.reminders_sent) ? (r.reminders_sent as string[]) : [];
    const due = dueReminders({ receptionDate: w.receptionDate, today, retentionCents: w.retention.cents, releasedAt: w.retention.releasedAt }, already);
    if (!due.length) continue;
    for (const key of due) {
      await notifyOrg(db, String(r.org_id), message(key, w));
      sent++;
    }
    await db.query("UPDATE job_receptions SET reminders_sent=$2 WHERE job_id=$1", [w.jobId, JSON.stringify([...already, ...due])]);
  }
  return { sent };
}

function message(key: string, w: WarrantyRow) {
  const url = `/app/chantiers/${w.jobId}`;
  if (key === "parfait_fin") {
    const end = w.periods[0].end;
    return {
      title: "Fin du parfait achèvement",
      body: `${w.title} : garantie de parfait achèvement jusqu'au ${frDate(end)}${w.openReserves ? `, ${w.openReserves} réserve${w.openReserves > 1 ? "s" : ""} encore à lever` : ""}.`,
      url,
    };
  }
  return {
    title: "Retenue de garantie à réclamer",
    body: `${w.title} : ${formatEuros(w.retention.cents)} libérables depuis le ${frDate(w.retention.releaseDate)}.`,
    url,
  };
}
