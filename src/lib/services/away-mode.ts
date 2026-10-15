/** Mode absence : réglages, préparation du départ, routage des demandes et bilan au retour. */

import type { Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { type AwaySettings, awaySchema, clientMessage, isAway, isUrgent, readiness } from "@/lib/away-mode";
import { validateEmail } from "@/lib/validation/identifiers";
import type { Ctx } from "./context";
import { audit, requireRole, requireWritable } from "./context";
import { appUrl, sendMail } from "./mail";
import { parisDate } from "./quotes";

const day = (v: unknown) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));
const COLS =
  "away_from, away_to, away_message, away_backup_name, away_backup_phone, away_backup_email, coalesce(nullif(trade_name, ''), legal_name) AS company";

async function load(db: Queryable, orgId: string) {
  const r = await one<Record<string, unknown>>(db, `SELECT ${COLS} FROM organizations WHERE id=$1`, [orgId]);
  const settings: AwaySettings = {
    from: day(r?.away_from),
    to: day(r?.away_to),
    message: String(r?.away_message ?? ""),
    backupName: String(r?.away_backup_name ?? ""),
    backupPhone: String(r?.away_backup_phone ?? ""),
    backupEmail: String(r?.away_backup_email ?? ""),
  };
  return { settings, company: String(r?.company ?? "") };
}

export async function getAway(ctx: Ctx) {
  return (await load(ctx.db, ctx.orgId)).settings;
}

export async function saveAway(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  const p = awaySchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const v = p.data;
  if (v.to < parisDate(new Date())) throw badRequest("La date de retour est déjà passée");
  const e = validateEmail(v.backupEmail);
  if (e) throw badRequest(e);
  await ctx.db.query(
    `UPDATE organizations SET away_from=$2, away_to=$3, away_message=$4, away_backup_name=$5, away_backup_phone=$6, away_backup_email=$7, updated_at=now() WHERE id=$1`,
    [ctx.orgId, v.from, v.to, v.message, v.backupName, v.backupPhone, v.backupEmail.toLowerCase()],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "away.set", data: { from: v.from, to: v.to }, ip: ctx.ip });
}

/** Met fin à l'absence (retour anticipé ou absence annulée). Le contact de secours est conservé pour la prochaine fois. */
export async function endAway(ctx: Ctx) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  await ctx.db.query("UPDATE organizations SET away_from=NULL, away_to=NULL, updated_at=now() WHERE id=$1", [ctx.orgId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "away.end", ip: ctx.ip });
}

/** Ce qui tournera seul pendant la période, et ce qu'il reste à régler avant de partir. */
export async function awayReadiness(ctx: Ctx, period: { from: string; to: string }) {
  const r = await one<Record<string, unknown>>(
    ctx.db,
    `SELECT (o.reminder_settings->>'enabled')::boolean IS TRUE AS quotes, (o.invoice_reminder_settings->>'enabled')::boolean IS TRUE AS invoices,
       (o.away_backup_phone <> '' OR o.away_backup_email <> '') AS backup,
       (SELECT count(DISTINCT job_id) FROM job_assignments a WHERE a.org_id=o.id AND a.start_date <= $3 AND a.end_date >= $2) AS jobs,
       (SELECT count(*) FROM invoices i WHERE i.org_id=o.id AND i.kind <> 'credit_note' AND i.due_date BETWEEN $2 AND $3
          AND i.amount_due_cents - i.paid_cents - i.credited_cents > 0) AS due,
       (SELECT count(*) FROM invoice_payments p WHERE p.org_id=o.id AND p.method='cheque' AND p.canceled_at IS NULL AND p.deposit_id IS NULL) AS cheques,
       (SELECT count(*) FROM quotes q WHERE q.org_id=o.id AND q.status IN ('draft','incomplete','ready')) AS drafts
     FROM organizations o WHERE o.id=$1`,
    [ctx.orgId, period.from, period.to],
  );
  return readiness({
    quoteReminders: !!r?.quotes,
    invoiceReminders: !!r?.invoices,
    backup: !!r?.backup,
    jobsDuring: num(r?.jobs),
    invoicesDueDuring: num(r?.due),
    chequesPending: num(r?.cheques),
    draftQuotes: num(r?.drafts),
  });
}

/** Ce qui s'est passé pendant l'absence, de son début à aujourd'hui (ou à son terme). */
export async function awayDigest(ctx: Ctx, period: { from: string; to: string }) {
  const end = [period.to, parisDate(new Date())].sort()[0];
  const r = await one<Record<string, unknown>>(
    ctx.db,
    `SELECT
       (SELECT count(*) FROM leads WHERE org_id=$1 AND (created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2 AND $3) AS leads,
       (SELECT count(*) FROM quotes WHERE org_id=$1 AND status='accepted' AND (updated_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2 AND $3) AS accepted,
       (SELECT coalesce(sum(amount_cents), 0) FROM invoice_payments WHERE org_id=$1 AND canceled_at IS NULL AND paid_on BETWEEN $2 AND $3) AS paid,
       (SELECT count(*) FROM emails WHERE org_id=$1 AND kind IN ('reminder', 'invoice_reminder') AND (created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2 AND $3) AS reminders,
       (SELECT count(*) FROM emails WHERE org_id=$1 AND kind='away_urgent' AND (created_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2 AND $3) AS urgent`,
    [ctx.orgId, period.from, end],
  );
  return { leads: num(r?.leads), accepted: num(r?.accepted), paidCents: num(r?.paid), reminders: num(r?.reminders), urgent: num(r?.urgent) };
}

/** Bandeau de la vitrine pendant l'absence */
export async function publicAway(db: Queryable, orgId: string, today = parisDate(new Date())) {
  const { settings, company } = await load(db, orgId);
  return isAway(settings, today) ? { to: settings.to!, message: clientMessage(settings, company) } : null;
}

/**
 * Demande reçue pendant l'absence : le demandeur reçoit le message d'absence, et une demande urgente est transmise
 * au contact de secours. Sans absence en cours, rien n'est fait.
 */
export async function routeDuringAway(
  db: Queryable,
  orgId: string,
  req: { name: string; email: string; phone: string; city: string; description: string },
  today = parisDate(new Date()),
) {
  const { settings, company } = await load(db, orgId);
  if (!isAway(settings, today)) return { away: false, urgent: false };
  const urgent = isUrgent(req.description);
  if (req.email) {
    await sendMail(db, {
      orgId,
      kind: "notification",
      to: req.email,
      subject: `${company || "Votre artisan"} : demande bien reçue`,
      body: `Bonjour ${req.name},\n\n${clientMessage(settings, company)}${urgent && settings.backupName ? `\n\nVotre demande semble urgente : elle a été transmise à ${settings.backupName}${settings.backupPhone ? `, joignable au ${settings.backupPhone}` : ""}.` : ""}`,
    });
  }
  if (urgent && settings.backupEmail) {
    await sendMail(db, {
      orgId,
      kind: "away_urgent",
      to: settings.backupEmail,
      subject: `Demande urgente pour ${company} : ${req.name}`,
      body: `${company} est absent jusqu'au ${settings.to} et vous a désigné comme contact de secours.\n\n${req.name}${req.city ? ` (${req.city})` : ""} :\n\n${req.description}\n\n${[req.phone, req.email].filter(Boolean).join(" ; ")}\n\n${appUrl("/app/demandes")}`,
    });
  }
  return { away: true, urgent };
}
