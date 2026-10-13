/**
 * Rendez-vous de visite pris en ligne depuis la vitrine : créneaux libres, réservation qui crée la
 * demande et prévient l'entreprise, liste des visites à venir, et ajout à l'agenda synchronisé.
 */

import { z } from "zod";
import { one, type Database, type Queryable } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { DAYS, parseDayHours, type Hours } from "@/lib/business-listing";
import { validateEmail } from "@/lib/validation/identifiers";
import { availableSlots, DURATIONS, NOTICES, readVisitSettings, slotLabel, type Slot, type VisitSettings } from "@/lib/visits";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { appUrl, sendMail } from "./mail";
import { notifyOrg } from "./push";

export async function getVisitSettings(ctx: Ctx): Promise<VisitSettings> {
  const r = await one<{ visit_settings: unknown }>(ctx.db, "SELECT visit_settings FROM showcases WHERE org_id=$1", [ctx.orgId]);
  return readVisitSettings(r?.visit_settings);
}

export async function saveVisitSettings(ctx: Ctx, raw: Record<string, string>): Promise<VisitSettings> {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  if (!(await one(ctx.db, "SELECT 1 FROM showcases WHERE org_id=$1", [ctx.orgId]))) throw badRequest("Enregistrez d'abord votre page vitrine");
  const hours: Hours = {};
  for (const d of DAYS) {
    const ranges = parseDayHours(raw[`visit_${d.key}`] ?? "");
    if (ranges === null) throw badRequest(`Plages du ${d.label.toLowerCase()} non comprises : écrivez par exemple 17h-19h, ou fermé`);
    if (ranges.length > 4) throw badRequest(`${d.label} : quatre plages au plus`);
    if (ranges.length) hours[d.key] = ranges;
  }
  const durationMin = Number(raw.durationMin);
  const noticeHours = Number(raw.noticeHours);
  if (!DURATIONS.includes(durationMin)) throw badRequest("Durée de visite invalide");
  if (!NOTICES.includes(noticeHours)) throw badRequest("Délai de prévenance invalide");
  const enabled = raw.enabled === "on" || raw.enabled === "true";
  if (enabled && !DAYS.some((d) => hours[d.key]?.length)) throw badRequest("Indiquez au moins une plage de visite");
  const s: VisitSettings = { enabled, hours, durationMin, noticeHours, horizonDays: 21 };
  await ctx.db.query("UPDATE showcases SET visit_settings=$2 WHERE org_id=$1", [ctx.orgId, JSON.stringify(s)]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "showcase.visits", data: { enabled }, ip: ctx.ip });
  return s;
}

async function bookingContext(db: Queryable, slug: string, now: Date) {
  const r = await one<{ org_id: string; trade_name: string; email: string; visit_settings: unknown }>(
    db,
    `SELECT s.org_id, o.trade_name, o.email, s.visit_settings FROM showcases s JOIN organizations o ON o.id=s.org_id
     WHERE s.slug=$1 AND s.enabled AND o.status='active'`,
    [slug],
  );
  if (!r) return null;
  const settings = readVisitSettings(r.visit_settings);
  if (!settings.enabled) return null;
  const until = new Date(now.getTime() + (settings.horizonDays + 2) * 86400000);
  const [taken, absences] = await Promise.all([
    db.query<{ starts_at: Date; ends_at: Date }>(
      "SELECT starts_at, ends_at FROM visit_bookings WHERE org_id=$1 AND status='confirmee' AND ends_at > $2 AND starts_at < $3",
      [r.org_id, now, until],
    ),
    // Jours d'absence des dirigeants : pas de visite proposée.
    db.query<{ start_date: unknown; end_date: unknown }>(
      `SELECT a.start_date, a.end_date FROM member_absences a JOIN memberships m ON m.user_id=a.user_id AND m.org_id=a.org_id
       WHERE a.org_id=$1 AND m.role='owner' AND a.end_date >= $2::date`,
      [r.org_id, now.toISOString().slice(0, 10)],
    ),
  ]);
  const blocked = new Set<string>();
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
  for (const a of absences) {
    for (let d = iso(a.start_date); d <= iso(a.end_date); d = new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)) blocked.add(d);
  }
  const slots = availableSlots(
    settings,
    now,
    taken.map((t) => ({ start: new Date(t.starts_at), end: new Date(t.ends_at) })),
    blocked,
  );
  return { orgId: r.org_id, orgName: r.trade_name, orgEmail: r.email, settings, slots };
}

export async function publicVisitSlots(db: Queryable, slug: string, now = new Date()): Promise<{ orgName: string; durationMin: number; slots: Slot[] } | null> {
  const c = await bookingContext(db, slug, now);
  return c ? { orgName: c.orgName, durationMin: c.settings.durationMin, slots: c.slots } : null;
}

const bookingSchema = z.object({
  start: z.string().min(10, "Choisissez un créneau"),
  name: z.string().trim().min(2, "Indiquez votre nom").max(160),
  phone: z.string().trim().min(6, "Indiquez un téléphone pour être joint le jour de la visite").max(30),
  email: z.string().trim().max(254).default(""),
  address: z.string().trim().min(5, "Indiquez l'adresse des travaux").max(200),
  city: z.string().trim().max(120).default(""),
  description: z.string().trim().min(10, "Décrivez vos travaux en quelques mots").max(4000),
  consent: z.preprocess((v) => v === true || v === "on" || v === "true", z.boolean()),
  website: z.string().default(""),
});

/** Réserve un créneau : vérifié à nouveau au moment de la réservation, il crée une demande au statut « Visite prévue ». */
export async function bookVisit(db: Database, slug: string, raw: unknown, meta: { ip: string }, now = new Date()) {
  await hitRate(db, "public.lead", meta.ip);
  const p = bookingSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const b = p.data;
  if (!b.consent) throw badRequest("Acceptez d'être recontacté au sujet de votre demande");
  const e = validateEmail(b.email);
  if (e) throw badRequest(e);
  const c = await bookingContext(db, slug, now);
  if (!c) throw notFound("Prise de rendez-vous indisponible");
  if (b.website) return { ok: true, label: "" };
  const slot = c.slots.find((s) => s.start === new Date(b.start).toISOString());
  if (!slot) throw conflict("Ce créneau n'est plus disponible : choisissez-en un autre");
  const start = new Date(slot.start);
  const end = new Date(start.getTime() + c.settings.durationMin * 60000);
  const label = slotLabel(start);
  await db.transaction(async (tx) => {
    const lead = await one<{ id: string }>(
      tx,
      `INSERT INTO leads (org_id, name, email, phone, city, description, source, status, next_action, next_action_on)
       VALUES ($1,$2,$3,$4,$5,$6,'site','visite',$7,$8) RETURNING id`,
      [c.orgId, b.name, b.email.toLowerCase(), b.phone, b.city, `${b.description}\n\nAdresse : ${b.address}`, `Visite le ${label}`, slot.day],
    );
    try {
      await tx.query(
        `INSERT INTO visit_bookings (org_id, lead_id, starts_at, ends_at, name, phone, email, address, city, description)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [c.orgId, lead!.id, start, end, b.name, b.phone, b.email.toLowerCase(), b.address, b.city, b.description],
      );
    } catch {
      throw conflict("Ce créneau vient d'être réservé : choisissez-en un autre");
    }
    const summary = `${b.name}, ${b.address}${b.city ? `, ${b.city}` : ""}, ${b.phone}`;
    if (c.orgEmail) {
      await sendMail(tx, {
        orgId: c.orgId,
        kind: "notification",
        to: c.orgEmail,
        subject: `Visite réservée le ${label}`,
        body: `${summary}\n\n${b.description}\n\n${appUrl("/app/demandes")}`,
      });
    }
    if (b.email) {
      await sendMail(tx, {
        orgId: c.orgId,
        kind: "visit_confirmation",
        to: b.email,
        subject: `Votre rendez-vous avec ${c.orgName} le ${label}`,
        body:
          `Bonjour,\n\nVotre visite est réservée le ${label}, au ${b.address}${b.city ? `, ${b.city}` : ""}. ` +
          `Elle dure environ ${c.settings.durationMin} minutes.\n\nPour la déplacer ou l'annuler, contactez directement ${c.orgName}.\n\nÀ bientôt,\n${c.orgName}`,
      });
    }
    await notifyOrg(tx, c.orgId, { title: `Visite réservée le ${label}`, body: summary.slice(0, 140), url: "/app/demandes" });
  });
  return { ok: true, label };
}

export interface Visit {
  id: string;
  leadId: string | null;
  start: Date;
  end: Date;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  description: string;
}

export async function upcomingVisits(ctx: Ctx, now = new Date()): Promise<Visit[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    "SELECT * FROM visit_bookings WHERE org_id=$1 AND status='confirmee' AND ends_at > $2 ORDER BY starts_at LIMIT 100",
    [ctx.orgId, now],
  );
  return rows.map((r) => ({
    id: String(r.id),
    leadId: (r.lead_id as string | null) ?? null,
    start: new Date(r.starts_at as string),
    end: new Date(r.ends_at as string),
    name: String(r.name),
    phone: String(r.phone),
    email: String(r.email),
    address: String(r.address),
    city: String(r.city),
    description: String(r.description),
  }));
}

/** Annule la visite : le créneau redevient libre et la demande revient « Recontactée ». */
export async function cancelVisit(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const r = await one<{ lead_id: string | null }>(
    ctx.db,
    "UPDATE visit_bookings SET status='annulee' WHERE id=$1 AND org_id=$2 AND status='confirmee' RETURNING lead_id",
    [id, ctx.orgId],
  );
  if (!r) throw notFound("Visite introuvable");
  if (r.lead_id) {
    await ctx.db.query("UPDATE leads SET status='contactee', next_action='Proposer une autre date de visite', updated_at=now() WHERE id=$1 AND org_id=$2", [
      r.lead_id,
      ctx.orgId,
    ]);
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "visit.cancel", target: id, ip: ctx.ip });
}
