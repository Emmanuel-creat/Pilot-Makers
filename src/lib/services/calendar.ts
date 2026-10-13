/**
 * Abonnement d'agenda (format iCalendar) : chaque personne obtient un lien secret qu'elle ajoute
 * dans Google Agenda, Outlook ou Apple Calendrier. L'agenda se met à jour tout seul : chantiers
 * planifiés, et pour l'encadrement les échéances de factures, de devis, de réserves et les livraisons.
 */

import type { Database } from "@/lib/db";
import { one } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { randomToken, sha256 } from "@/lib/security";
import { buildContext, type RequestMeta } from "./accounts";
import type { Ctx } from "./context";
import { audit, can, requireWritable } from "./context";

export type FeedScope = "moi" | "entreprise";

export interface CalendarEvent {
  uid: string;
  /** Jour de début, inclus (AAAA-MM-JJ) */
  start: string;
  /** Jour de fin, inclus */
  end: string;
  summary: string;
  description?: string;
  location?: string;
  url?: string;
  category?: string;
}

/* ------------------------------------------------------------------ */
/* Format iCalendar (RFC 5545)                                          */
/* ------------------------------------------------------------------ */

export function icsEscape(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lignes de 75 octets au plus, la suite commençant par une espace, sans couper un caractère. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  let size = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const max = parts.length ? 74 : 75;
    if (size + n > max) {
      parts.push(cur);
      cur = "";
      size = 0;
    }
    cur += ch;
    size += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const compact = (iso: string) => iso.replace(/-/g, "");
const nextDay = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};
const stamp = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

export function buildCalendar(name: string, events: CalendarEvent[], now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Pilot-Makers//Agenda//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(name)}`,
    "X-WR-TIMEZONE:Europe/Paris",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@pilot-makers`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      `DTEND;VALUE=DATE:${compact(nextDay(e.end))}`,
      `SUMMARY:${icsEscape(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.category) lines.push(`CATEGORIES:${icsEscape(e.category)}`);
    lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ */
/* Événements                                                           */
/* ------------------------------------------------------------------ */

const iso = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const shift = (d: Date, days: number) => new Date(d.getTime() + days * 86400000).toISOString().slice(0, 10);
const euros = (cents: number) =>
  (cents / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, " ") + " EUR";
const address = (r: Record<string, unknown>) =>
  [r.site_line1, r.site_line2, [r.site_postal_code, r.site_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

/** Événements de l'agenda : trois mois passés, un an à venir. */
export async function calendarEvents(ctx: Ctx, scope: FeedScope, origin = "", now = new Date()): Promise<CalendarEvent[]> {
  const from = shift(now, -92);
  const to = shift(now, 400);
  const company = scope === "entreprise" && ctx.role !== "member";
  const events: CalendarEvent[] = [];
  const link = (path: string) => (origin ? `${origin}${path}` : undefined);

  const assignments = await ctx.db.query<Record<string, unknown>>(
    `SELECT a.id, a.job_id, a.start_date, a.end_date, a.resource_type, j.title, j.site_line1, j.site_line2, j.site_postal_code, j.site_city,
            j.access_notes, coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), '')) AS customer_name,
            CASE WHEN a.resource_type='user' THEN (SELECT u.name FROM users u WHERE u.id=a.resource_id)
                 ELSE (SELECT v.name FROM org_vehicles v WHERE v.id=a.resource_id) END AS resource_name
     FROM job_assignments a JOIN jobs j ON j.id=a.job_id LEFT JOIN customers c ON c.id=j.customer_id
     WHERE a.org_id=$1 AND a.start_date <= $3 AND a.end_date >= $2 ${company ? "" : "AND a.resource_type='user' AND a.resource_id=$4"}
     ORDER BY a.start_date`,
    company ? [ctx.orgId, from, to] : [ctx.orgId, from, to, ctx.userId],
  );
  for (const a of assignments) {
    const who = String(a.resource_name ?? "");
    events.push({
      uid: `affectation-${a.id}`,
      start: iso(a.start_date),
      end: iso(a.end_date),
      summary: company && who ? `${a.title} (${who})` : `Chantier : ${a.title}`,
      description: [a.customer_name ? `Client : ${a.customer_name}` : "", a.access_notes ? `Accès : ${a.access_notes}` : ""]
        .filter(Boolean)
        .join("\n"),
      location: address(a),
      url: link(`/app/chantiers/${a.job_id}`),
      category: "Chantier",
    });
  }
  if (!company) return events;
  const billing = can(ctx, "billing");

  const invoices = !billing
    ? []
    : await ctx.db.query<Record<string, unknown>>(
        `SELECT i.id, i.number, i.due_date, i.amount_due_cents - i.paid_cents - i.credited_cents AS rest, coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), '')) AS customer_name
     FROM invoices i LEFT JOIN customers c ON c.id=i.customer_id
     WHERE i.org_id=$1 AND i.kind <> 'credit_note' AND i.amount_due_cents - i.paid_cents - i.credited_cents > 0 AND i.due_date BETWEEN $2 AND $3`,
        [ctx.orgId, from, to],
      );
  for (const i of invoices)
    events.push({
      uid: `facture-${i.id}`,
      start: iso(i.due_date),
      end: iso(i.due_date),
      summary: `Échéance facture ${i.number}${i.customer_name ? ` (${i.customer_name})` : ""}`,
      description: `Reste à encaisser : ${euros(Number(i.rest))}`,
      url: link(`/app/factures/${i.id}`),
      category: "Facture",
    });

  const quotes = !billing
    ? []
    : await ctx.db.query<Record<string, unknown>>(
        `SELECT q.id, q.number, q.title, q.valid_until, coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), '')) AS customer_name FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id
     WHERE q.org_id=$1 AND q.status IN ('sent', 'viewed') AND q.valid_until BETWEEN $2 AND $3`,
        [ctx.orgId, from, to],
      );
  for (const q of quotes)
    events.push({
      uid: `devis-${q.id}`,
      start: iso(q.valid_until),
      end: iso(q.valid_until),
      summary: `Fin de validité du devis ${q.number ?? ""}${q.customer_name ? ` (${q.customer_name})` : ""}`.replace(/\s+/g, " "),
      description: q.title ? String(q.title) : undefined,
      url: link(`/app/devis/${q.id}`),
      category: "Devis",
    });

  const reserves = await ctx.db.query<Record<string, unknown>>(
    `SELECT r.id, r.job_id, r.label, r.location, r.due_date, j.title FROM job_reserves r JOIN jobs j ON j.id=r.job_id
     WHERE r.org_id=$1 AND r.lifted_at IS NULL AND r.due_date BETWEEN $2 AND $3`,
    [ctx.orgId, from, to],
  );
  for (const r of reserves)
    events.push({
      uid: `reserve-${r.id}`,
      start: iso(r.due_date),
      end: iso(r.due_date),
      summary: `Lever la réserve : ${r.label}`,
      description: [`Chantier : ${r.title}`, r.location ? `Emplacement : ${r.location}` : ""].filter(Boolean).join("\n"),
      url: link(`/app/chantiers/${r.job_id}`),
      category: "Réserve",
    });

  const orders = !can(ctx, "costs")
    ? []
    : await ctx.db.query<Record<string, unknown>>(
        `SELECT o.id, o.job_id, o.number, o.supplier, o.delivery_date, o.delivery_address, j.title FROM purchase_orders o JOIN jobs j ON j.id=o.job_id
     WHERE o.org_id=$1 AND o.status IN ('envoye', 'recu_partiel') AND o.delivery_date BETWEEN $2 AND $3`,
        [ctx.orgId, from, to],
      );
  for (const o of orders)
    events.push({
      uid: `commande-${o.id}`,
      start: iso(o.delivery_date),
      end: iso(o.delivery_date),
      summary: `Livraison ${o.supplier || "fournisseur"} (${o.number})`,
      description: `Chantier : ${o.title}`,
      location: String(o.delivery_address ?? ""),
      url: link(`/app/chantiers/${o.job_id}/commandes/${o.id}`),
      category: "Livraison",
    });
  return events;
}

/* ------------------------------------------------------------------ */
/* Lien d'abonnement                                                    */
/* ------------------------------------------------------------------ */

export async function getFeed(ctx: Ctx) {
  return one<{ prefix: string; scope: FeedScope; created_at: Date; last_used_at: Date | null }>(
    ctx.db,
    "SELECT prefix, scope, created_at, last_used_at FROM calendar_feeds WHERE org_id=$1 AND user_id=$2",
    [ctx.orgId, ctx.userId],
  );
}

/** Crée ou remplace le lien : l'ancien cesse aussitôt de fonctionner. Le lien n'est montré qu'une fois. */
export async function createFeed(ctx: Ctx, scope: string): Promise<{ token: string }> {
  requireWritable(ctx);
  if (scope !== "moi" && scope !== "entreprise") throw badRequest("Contenu de l'agenda inconnu");
  const s: FeedScope = scope === "entreprise" && ctx.role !== "member" ? "entreprise" : "moi";
  const token = `cal_${randomToken(24)}`;
  await ctx.db.query(
    `INSERT INTO calendar_feeds (org_id, user_id, token_hash, prefix, scope) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (org_id, user_id) DO UPDATE SET token_hash=EXCLUDED.token_hash, prefix=EXCLUDED.prefix, scope=EXCLUDED.scope,
       created_at=now(), last_used_at=NULL`,
    [ctx.orgId, ctx.userId, sha256(token), token.slice(0, 10), s],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "calendar.feed", data: { scope: s }, ip: ctx.ip });
  return { token };
}

export async function deleteFeed(ctx: Ctx) {
  requireWritable(ctx);
  await ctx.db.query("DELETE FROM calendar_feeds WHERE org_id=$1 AND user_id=$2", [ctx.orgId, ctx.userId]);
}

/** Agenda lu par l'application d'agenda, sans session : le lien secret fait office d'accès. */
export async function feedCalendar(db: Database, token: string, meta: RequestMeta, origin = "", now = new Date()) {
  const clean = token.replace(/\.ics$/, "");
  if (!/^cal_[A-Za-z0-9_-]{20,64}$/.test(clean)) throw notFound("Agenda introuvable");
  const feed = await one<{ id: string; org_id: string; user_id: string; scope: FeedScope }>(
    db,
    "SELECT id, org_id, user_id, scope FROM calendar_feeds WHERE token_hash=$1",
    [sha256(clean)],
  );
  if (!feed) throw notFound("Agenda introuvable");
  await hitRate(db, "public.view", `cal:${feed.id}`);
  const user = await one<{ status: string }>(db, "SELECT status FROM users WHERE id=$1", [feed.user_id]);
  const ctx = user?.status === "active" ? await buildContext(db, feed.user_id, feed.org_id, null, meta) : null;
  // Personne partie de l'entreprise ou compte fermé : le lien ne donne plus rien.
  if (!ctx || ctx.orgId !== feed.org_id) throw notFound("Agenda introuvable");
  await db.query("UPDATE calendar_feeds SET last_used_at=now() WHERE id=$1", [feed.id]);
  const org = await one<{ trade_name: string; legal_name: string }>(db, "SELECT trade_name, legal_name FROM organizations WHERE id=$1", [
    feed.org_id,
  ]);
  const name = `${org?.trade_name || org?.legal_name || "Pilot-Makers"}${feed.scope === "entreprise" && ctx.role !== "member" ? "" : " (mes chantiers)"}`;
  return buildCalendar(name, await calendarEvents(ctx, feed.scope, origin, now), now);
}
