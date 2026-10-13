/**
 * Assistance humaine : rappel par téléphone sur un créneau choisi, séances de prise en main en ligne.
 *
 * Les demandes de rappel arrivent dans l'administration de la plateforme, triées par créneau. Les séances
 * sont programmées par l'équipe ; chacun s'inscrit dans la limite des places et reçoit le lien par e-mail,
 * avec l'invitation d'agenda.
 */

import { badRequest, forbidden, notFound } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { requirePlatformAdmin } from "./admin";
import { icsEscape, foldLine } from "./calendar";
import type { Ctx } from "./context";
import { audit } from "./context";
import { appUrl, sendMail } from "./mail";
import { parisDate } from "./quotes";

export const CALLBACK_SLOTS = { matin: "Entre 9 h et 12 h", apres_midi: "Entre 14 h et 17 h" } as const;
export type CallbackSlot = keyof typeof CALLBACK_SLOTS;
export const CALLBACK_STATUSES = { demande: "Rappel prévu", fait: "Rappel effectué", injoignable: "Injoignable", annule: "Annulé" } as const;

/** Numéro français (fixe ou mobile, 0X ou +33) ramené à 0X XX XX XX XX ; null s'il est invalide. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[\s.\-()]/g, "");
  if (d.startsWith("+33")) d = "0" + d.slice(3);
  else if (d.startsWith("0033")) d = "0" + d.slice(4);
  if (!/^0[1-9]\d{8}$/.test(d)) return null;
  return d.replace(/(\d{2})(?=\d)/g, "$1 ");
}

const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T12:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay();

const parisHour = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" }).format(d));

/** Jours ouvrés proposés pour un rappel : les 10 prochains, du lundi au vendredi, à partir du jour même. */
export function callbackDays(now = new Date()): string[] {
  const out: string[] = [];
  let d = parisDate(now);
  // Après 16 h, le créneau de l'après-midi du jour n'est plus tenable : on part du lendemain.
  const hour = parisHour(now);
  if (hour >= 16) d = addDays(d, 1);
  while (out.length < 10) {
    if (weekday(d) !== 0 && weekday(d) !== 6) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

export async function requestCallback(ctx: Ctx, raw: { phone: string; date: string; slot: string; topic: string }, now = new Date()) {
  if (ctx.supportAccess) throw forbidden("Indisponible en accès support");
  const phone = normalizePhone(raw.phone);
  if (!phone) throw badRequest("Numéro de téléphone invalide : indiquez un numéro français à 10 chiffres", { phone: "Numéro invalide" });
  if (!(raw.slot in CALLBACK_SLOTS)) throw badRequest("Choisissez un créneau");
  const days = callbackDays(now);
  if (!days.includes(raw.date)) throw badRequest("Choisissez un jour ouvré dans les deux semaines à venir");
  if (raw.date === parisDate(now) && raw.slot === "matin") {
    const hour = parisHour(now);
    if (hour >= 11) throw badRequest("Le créneau du matin est passé : choisissez l'après-midi ou un autre jour");
  }
  await hitRate(ctx.db, "support.request", ctx.userId);
  const open = await ctx.db.query<{ n: number }>("SELECT count(*)::int AS n FROM support_callbacks WHERE user_id=$1 AND status='demande'", [ctx.userId]);
  if (open[0].n > 0) throw badRequest("Un rappel est déjà prévu : annulez-le pour en choisir un autre");
  const r = await ctx.db.query<{ id: string }>(
    "INSERT INTO support_callbacks (org_id, user_id, phone, wished_on, slot, topic) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [ctx.orgId, ctx.userId, phone, raw.date, raw.slot, raw.topic.trim().slice(0, 500)],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "support.callback_request", target: r[0].id, ip: ctx.ip });
  return r[0].id;
}

export async function cancelCallback(ctx: Ctx, id: string) {
  const r = await ctx.db.query("UPDATE support_callbacks SET status='annule' WHERE id=$1 AND user_id=$2 AND status='demande' RETURNING id", [id, ctx.userId]);
  if (!r.length) throw notFound("Rappel introuvable");
}

export interface Callback {
  id: string;
  phone: string;
  wished_on: string;
  slot: CallbackSlot;
  topic: string;
  status: keyof typeof CALLBACK_STATUSES;
  outcome: string;
  created_at: Date;
  org_name?: string;
  user_name?: string;
  user_email?: string;
}

const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));

export async function myCallbacks(ctx: Ctx) {
  const rows = await ctx.db.query<Callback>(
    "SELECT id, phone, wished_on, slot, topic, status, outcome, created_at FROM support_callbacks WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10",
    [ctx.userId],
  );
  return rows.map((r) => ({ ...r, wished_on: day(r.wished_on) }));
}

/** Administration : rappels à passer (par créneau) puis les plus récents traités. */
export async function listCallbacks(ctx: Ctx) {
  requirePlatformAdmin(ctx);
  const rows = await ctx.db.query<Callback>(
    `SELECT c.id, c.phone, c.wished_on, c.slot, c.topic, c.status, c.outcome, c.created_at, o.trade_name AS org_name, u.name AS user_name, u.email AS user_email
     FROM support_callbacks c JOIN organizations o ON o.id=c.org_id JOIN users u ON u.id=c.user_id
     ORDER BY (c.status='demande') DESC, CASE WHEN c.status='demande' THEN c.wished_on END ASC, c.slot ASC, c.created_at DESC LIMIT 200`,
  );
  return rows.map((r) => ({ ...r, wished_on: day(r.wished_on) }));
}

export async function closeCallback(ctx: Ctx, id: string, status: string, outcome: string) {
  requirePlatformAdmin(ctx);
  if (status !== "fait" && status !== "injoignable") throw badRequest("Issue inconnue");
  const r = await ctx.db.query("UPDATE support_callbacks SET status=$2, outcome=$3, handled_by=$4, handled_at=now() WHERE id=$1 RETURNING id", [
    id,
    status,
    outcome.trim().slice(0, 1000),
    ctx.userId,
  ]);
  if (!r.length) throw notFound("Rappel introuvable");
  await audit(ctx.db, { userId: ctx.userId, action: "admin.callback_close", target: id, data: { status }, ip: ctx.ip });
}

/* Séances de prise en main ------------------------------------------------ */

export interface OnboardingSession {
  id: string;
  starts_at: Date;
  duration_min: number;
  title: string;
  description: string;
  capacity: number;
  meeting_url: string;
  canceled_at: Date | null;
  registered: number;
  mine?: boolean;
}

/** Heure de Paris saisie (AAAA-MM-JJTHH:MM) convertie en instant. */
export function parisToUtc(local: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offset = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: "Europe/Paris",
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
        .formatToParts(new Date(t))
        .map((x) => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - t;
  };
  let t = wall - offset(wall);
  t = wall - offset(t);
  return new Date(t);
}

export async function createSession(ctx: Ctx, raw: { startsAt: string; duration: string; title: string; description: string; capacity: string; url: string }) {
  requirePlatformAdmin(ctx);
  const start = parisToUtc(raw.startsAt);
  if (!start || start.getTime() < Date.now()) throw badRequest("Date de la séance invalide ou passée");
  const duration = Number(raw.duration || 45);
  const capacity = Number(raw.capacity || 12);
  if (!Number.isInteger(duration) || duration < 15 || duration > 240) throw badRequest("Durée : de 15 à 240 minutes");
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) throw badRequest("Nombre de places : de 1 à 500");
  if (raw.title.trim().length < 3) throw badRequest("Donnez un titre à la séance");
  const url = raw.url.trim();
  if (url && !/^https:\/\/[^\s]+$/.test(url)) throw badRequest("Le lien de la visioconférence doit commencer par https://");
  const r = await ctx.db.query<{ id: string }>(
    "INSERT INTO onboarding_sessions (starts_at, duration_min, title, description, capacity, meeting_url, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [start, duration, raw.title.trim().slice(0, 120), raw.description.trim().slice(0, 1000), capacity, url, ctx.userId],
  );
  await audit(ctx.db, { userId: ctx.userId, action: "admin.onboarding_session", target: r[0].id, ip: ctx.ip });
  return r[0].id;
}

/** Annulation par l'équipe : chaque inscrit est prévenu. */
export async function cancelSession(ctx: Ctx, id: string) {
  requirePlatformAdmin(ctx);
  const s = (
    await ctx.db.query<OnboardingSession>("UPDATE onboarding_sessions SET canceled_at=now() WHERE id=$1 AND canceled_at IS NULL RETURNING *", [id])
  )[0];
  if (!s) throw notFound("Séance introuvable");
  const people = await ctx.db.query<{ email: string; org_id: string }>(
    "SELECT u.email, r.org_id FROM onboarding_registrations r JOIN users u ON u.id=r.user_id WHERE r.session_id=$1",
    [id],
  );
  for (const p of people) {
    await sendMail(ctx.db, {
      orgId: p.org_id,
      kind: "onboarding_canceled",
      to: p.email,
      subject: `Séance annulée : ${s.title}`,
      body: `Bonjour,\n\nLa séance de prise en main « ${s.title} » du ${when(s.starts_at)} est annulée. Inscrivez-vous à une autre date :\n${appUrl("/app/assistance")}\n\nToutes nos excuses.`,
    });
  }
  await audit(ctx.db, { userId: ctx.userId, action: "admin.onboarding_cancel", target: id, data: { notified: people.length }, ip: ctx.ip });
}

/** Séances à venir (et en cours), avec les places prises. */
export async function upcomingSessions(ctx: Ctx, opts: { all?: boolean } = {}, now = new Date()) {
  if (opts.all) requirePlatformAdmin(ctx);
  return ctx.db.query<OnboardingSession>(
    `SELECT s.*, (SELECT count(*)::int FROM onboarding_registrations r WHERE r.session_id=s.id) AS registered,
       EXISTS (SELECT 1 FROM onboarding_registrations r WHERE r.session_id=s.id AND r.user_id=$1) AS mine
     FROM onboarding_sessions s
     WHERE s.starts_at + make_interval(mins => s.duration_min) > $2 AND ($3 OR s.canceled_at IS NULL)
     ORDER BY s.starts_at LIMIT 50`,
    [ctx.userId, now, !!opts.all],
  );
}

export async function sessionAttendees(ctx: Ctx, id: string) {
  requirePlatformAdmin(ctx);
  return ctx.db.query<{ name: string; email: string; org_name: string }>(
    `SELECT u.name, u.email, o.trade_name AS org_name FROM onboarding_registrations r
     JOIN users u ON u.id=r.user_id JOIN organizations o ON o.id=r.org_id WHERE r.session_id=$1 ORDER BY r.created_at`,
    [id],
  );
}

function when(d: Date) {
  return d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

/** Invitation d'agenda (iCalendar) d'une séance. */
export function sessionInvite(s: Pick<OnboardingSession, "id" | "starts_at" | "duration_min" | "title" | "description" | "meeting_url">, now = new Date()) {
  const end = new Date(s.starts_at.getTime() + s.duration_min * 60_000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pilot-Makers//Prise en main//FR",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:seance-${s.id}@pilot-makers`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(s.starts_at)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${icsEscape(`Pilot-Makers : ${s.title}`)}`,
  ];
  const desc = [s.description, s.meeting_url ? `Rejoindre : ${s.meeting_url}` : ""].filter(Boolean).join("\n");
  if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
  if (s.meeting_url) lines.push(`LOCATION:${icsEscape(s.meeting_url)}`, `URL:${s.meeting_url}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export async function registerToSession(ctx: Ctx, id: string, now = new Date()) {
  if (ctx.supportAccess) throw forbidden("Indisponible en accès support");
  await hitRate(ctx.db, "support.request", ctx.userId);
  const s = await ctx.db.transaction(async (tx) => {
    // Verrou sur la séance : deux inscriptions simultanées ne dépassent pas le nombre de places.
    const row = (await tx.query<OnboardingSession>("SELECT * FROM onboarding_sessions WHERE id=$1 FOR UPDATE", [id]))[0];
    if (!row || row.canceled_at) throw notFound("Séance introuvable ou annulée");
    if (new Date(row.starts_at).getTime() <= now.getTime()) throw badRequest("Cette séance a déjà commencé");
    const taken = (await tx.query<{ n: number }>("SELECT count(*)::int AS n FROM onboarding_registrations WHERE session_id=$1", [id]))[0].n;
    if (taken >= row.capacity) throw badRequest("Séance complète : choisissez une autre date");
    const ins = await tx.query(
      "INSERT INTO onboarding_registrations (session_id, user_id, org_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING session_id",
      [id, ctx.userId, ctx.orgId],
    );
    if (!ins.length) throw badRequest("Vous êtes déjà inscrit à cette séance");
    return row;
  });
  const start = new Date(s.starts_at);
  await sendMail(ctx.db, {
    orgId: ctx.orgId,
    kind: "onboarding_registered",
    to: ctx.email,
    subject: `Inscription confirmée : ${s.title}`,
    body:
      `Bonjour,\n\nVotre place est réservée pour la séance de prise en main « ${s.title} », ${when(start)} (${s.duration_min} minutes).\n\n` +
      (s.meeting_url ? `Lien de connexion : ${s.meeting_url}\n\n` : "Le lien de connexion vous sera envoyé avant la séance.\n\n") +
      `Ajoutez-la à votre agenda : ${appUrl(`/api/onboarding/${s.id}/agenda`)}\nVous pouvez vous désinscrire depuis ${appUrl("/app/assistance")}.`,
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "support.onboarding_register", target: id, ip: ctx.ip });
}

export async function unregisterFromSession(ctx: Ctx, id: string) {
  const r = await ctx.db.query("DELETE FROM onboarding_registrations WHERE session_id=$1 AND user_id=$2 RETURNING session_id", [id, ctx.userId]);
  if (!r.length) throw notFound("Inscription introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "support.onboarding_unregister", target: id, ip: ctx.ip });
}

/** Invitation d'agenda, réservée aux inscrits (et à l'équipe). */
export async function sessionCalendar(ctx: Ctx, id: string) {
  const s = (await ctx.db.query<OnboardingSession>("SELECT * FROM onboarding_sessions WHERE id=$1", [id]))[0];
  if (!s) throw notFound("Séance introuvable");
  if (!ctx.isPlatformAdmin) {
    const reg = await ctx.db.query("SELECT 1 FROM onboarding_registrations WHERE session_id=$1 AND user_id=$2", [id, ctx.userId]);
    if (!reg.length) throw notFound("Séance introuvable");
  }
  return sessionInvite({ ...s, starts_at: new Date(s.starts_at) });
}

/** Numéro de l'assistance affiché aux clients, s'il est configuré (SUPPORT_PHONE). */
export function supportPhone(env: Record<string, string | undefined> = process.env) {
  return env.SUPPORT_PHONE ? normalizePhone(env.SUPPORT_PHONE) : null;
}
