/**
 * Relances automatiques des devis envoyés (module K).
 *
 * runReminders() est à appeler régulièrement (tâche planifiée qui interroge
 * POST /api/cron/reminders avec le secret CRON_SECRET). Chaque relance est
 * tracée ; une clé d'idempotence empêche les doublons même si la tâche est
 * lancée plusieurs fois.
 */

import { z } from "zod";
import type { Database } from "@/lib/db";
import { num } from "@/lib/db";
import { formatEuros } from "@/lib/calc/format";
import { badRequest } from "@/lib/http";
import type { Ctx } from "./context";
import { requireRole, requireWritable } from "./context";
import { DEFAULT_REMINDERS } from "./accounts";
import { appUrl, renderTemplate, sendMail } from "./mail";
import { createShareLink, expireQuotes, frDate } from "./quotes";
import type { QuoteSnapshot } from "./quote-types";

export const reminderSchema = z.object({
  enabled: z.boolean(),
  firstDelayDays: z.coerce.number().int().min(1).max(60),
  intervalDays: z.coerce.number().int().min(1).max(60),
  maxReminders: z.coerce.number().int().min(0).max(5),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1, "Choisissez au moins un jour d'envoi"),
  hourFrom: z.coerce.number().int().min(0).max(23),
  hourTo: z.coerce.number().int().min(1).max(24),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
  minAmountCents: z.coerce.number().int().min(0).default(0),
});
export type ReminderSettings = z.infer<typeof reminderSchema>;

export function readSettings(raw: unknown): ReminderSettings {
  const parsed = reminderSchema.safeParse({ ...DEFAULT_REMINDERS, ...(raw as object) });
  return parsed.success ? parsed.data : (DEFAULT_REMINDERS as ReminderSettings);
}

export async function saveReminderSettings(ctx: Ctx, raw: unknown) {
  requireRole(ctx, "admin");
  requireWritable(ctx);
  if (!ctx.entitlements.plan.features.reminders) throw badRequest("Les relances automatiques sont incluses dans les offres Professionnel et Entreprise");
  const parsed = reminderSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  if (parsed.data.hourTo <= parsed.data.hourFrom) throw badRequest("La plage horaire est invalide");
  await ctx.db.query("UPDATE organizations SET reminder_settings=$2, updated_at=now() WHERE id=$1", [ctx.orgId, JSON.stringify(parsed.data)]);
}

function parisParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", hour12: false }).formatToParts(d);
  const wd = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return { weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd), hour };
}

export async function runReminders(db: Database, now = new Date()) {
  await expireQuotes(db);
  const orgs = await db.query<{ id: string; trade_name: string; reminder_settings: unknown }>(
    "SELECT o.id, o.trade_name, o.reminder_settings FROM organizations o WHERE o.status='active' AND (o.reminder_settings->>'enabled')::boolean IS TRUE",
  );
  let sent = 0;
  for (const org of orgs) {
    const s = readSettings(org.reminder_settings);
    if (!s.enabled || s.maxReminders === 0) continue;
    const { weekday, hour } = parisParts(now);
    if (!s.weekdays.includes(weekday) || hour < s.hourFrom || hour >= s.hourTo) continue;
    // Seuls les devis en attente sont relancés : accepté, refusé, annulé, remplacé ou expiré arrêtent les relances.
    const quotes = await db.query<{ id: string; current_version: unknown; sent_at: Date; total_ttc_cents: unknown; reminders: unknown; last_reminder: Date | null }>(
      `SELECT q.id, q.current_version, q.sent_at, q.total_ttc_cents,
              (SELECT count(*) FROM emails e WHERE e.quote_id=q.id AND e.kind='reminder' AND e.status='sent') AS reminders,
              (SELECT max(created_at) FROM emails e WHERE e.quote_id=q.id AND e.kind='reminder') AS last_reminder
       FROM quotes q WHERE q.org_id=$1 AND q.status IN ('sent','viewed') AND q.sent_at IS NOT NULL AND q.archived_at IS NULL`,
      [org.id],
    );
    for (const q of quotes) {
      const count = num(q.reminders);
      if (count >= s.maxReminders) continue;
      if (num(q.total_ttc_cents) < s.minAmountCents) continue;
      const ref = q.last_reminder ?? q.sent_at;
      const wait = (count === 0 ? s.firstDelayDays : s.intervalDays) * 86_400_000;
      if (now.getTime() - new Date(ref).getTime() < wait) continue;
      const v = await db.query<{ id: string; snapshot: QuoteSnapshot }>(
        "SELECT id, snapshot FROM quote_versions WHERE quote_id=$1 AND version=$2",
        [q.id, num(q.current_version)],
      );
      if (!v[0]) continue;
      const snap = v[0].snapshot;
      if (!snap.customer.email) continue;
      const link = await createShareLink(db, org.id, q.id, snap.version, snap.validUntil);
      const vars = {
        client: snap.customer.contact || snap.customer.name,
        numero: snap.number,
        objet: snap.quote.title,
        total_ttc: formatEuros(snap.calc.totalTtcCents),
        validite: frDate(snap.validUntil),
        entreprise: org.trade_name,
        lien: link.url,
      };
      const mail = await sendMail(db, {
        orgId: org.id,
        quoteId: q.id,
        kind: "reminder",
        to: snap.customer.email,
        subject: renderTemplate(s.subject, vars),
        body: renderTemplate(s.body, vars),
        attachmentVersionId: v[0].id,
        idempotencyKey: `reminder:${q.id}:${snap.version}:${count + 1}`,
      });
      await db.query(
        "INSERT INTO document_events (org_id, quote_id, version, type, actor_type, data) VALUES ($1,$2,$3,'reminder','system',$4)",
        [org.id, q.id, snap.version, JSON.stringify({ number: count + 1, status: mail.status, email_id: mail.id })],
      );
      if (!mail.duplicate && mail.status === "sent") sent++;
    }
  }
  return { sent, link: appUrl() };
}
