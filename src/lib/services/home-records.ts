/** Carnets de santé des logements des clients, tenus à partir des chantiers et complétés à la main. */

import { z } from "zod";
import { one, type Queryable } from "@/lib/db";
import {
  activeWarranties,
  addressKey,
  entriesToImport,
  ENTRY_KINDS,
  parseExchange,
  shareTokenOf,
  timeline,
  toExchange,
  type EntryKind,
  type RecordEntry,
  type RecordJob,
} from "@/lib/home-record";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { randomToken, sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { parisDate } from "./quotes";

const CUSTOMER = "coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), ''), '')";
const iso = (v: unknown) => (v == null ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));

/** Crée le carnet de chaque adresse de chantier qui n'en a pas encore. */
async function syncRecords(ctx: Ctx) {
  const jobs = await ctx.db.query<{ customer_id: string; site_line1: string; site_postal_code: string; site_city: string }>(
    "SELECT DISTINCT customer_id, site_line1, site_postal_code, site_city FROM jobs WHERE org_id=$1 AND customer_id IS NOT NULL AND trim(site_line1) <> ''",
    [ctx.orgId],
  );
  for (const j of jobs) {
    await ctx.db.query(
      `INSERT INTO home_records (org_id, customer_id, address_key, line1, postal_code, city) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (org_id, customer_id, address_key) DO NOTHING`,
      [ctx.orgId, j.customer_id, addressKey(j.site_line1, j.site_postal_code, j.site_city), j.site_line1.trim(), j.site_postal_code.trim(), j.site_city.trim()],
    );
  }
}

async function jobsAt(db: Queryable, orgId: string, customerId: string, key: string): Promise<RecordJob[]> {
  const rows = await db.query<{ id: string; title: string; start_date: unknown; end_date: unknown; reception_date: unknown; l: string; p: string; c: string }>(
    `SELECT j.id, j.title, j.start_date, j.end_date, r.reception_date, j.site_line1 AS l, j.site_postal_code AS p, j.site_city AS c
       FROM jobs j LEFT JOIN job_receptions r ON r.job_id=j.id AND r.decision <> 'refus'
      WHERE j.org_id=$1 AND j.customer_id=$2`,
    [orgId, customerId],
  );
  return rows
    .filter((r) => addressKey(r.l, r.p, r.c) === key)
    .map((r) => ({ id: r.id, title: r.title, startDate: iso(r.start_date), endDate: iso(r.end_date), receptionDate: iso(r.reception_date) }));
}

async function entriesOf(db: Queryable, recordId: string): Promise<RecordEntry[]> {
  const rows = await db.query<Record<string, unknown>>(
    "SELECT id, entry_date, kind, label, detail, brand, warranty_until, maintenance_months, source_name FROM home_record_entries WHERE record_id=$1 ORDER BY entry_date DESC",
    [recordId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    date: iso(r.entry_date)!,
    kind: r.kind as EntryKind,
    label: String(r.label),
    detail: String(r.detail),
    brand: String(r.brand),
    warrantyUntil: iso(r.warranty_until),
    maintenanceMonths: r.maintenance_months == null ? null : Number(r.maintenance_months),
    source: String(r.source_name ?? ""),
  }));
}

export async function listHomeRecords(ctx: Ctx, customerId?: string) {
  await syncRecords(ctx);
  const rows = await ctx.db.query<{
    id: string;
    line1: string;
    postal_code: string;
    city: string;
    customer_id: string;
    customer: string;
    entries: unknown;
    shared: boolean;
  }>(
    `SELECT h.id, h.line1, h.postal_code, h.city, h.customer_id, ${CUSTOMER} AS customer,
       (SELECT count(*) FROM home_record_entries e WHERE e.record_id=h.id) AS entries,
       (h.share_token_hash IS NOT NULL AND h.share_expires_at > now()) AS shared
     FROM home_records h JOIN customers c ON c.id=h.customer_id
     WHERE h.org_id=$1 AND ($2::uuid IS NULL OR h.customer_id=$2) ORDER BY h.city, h.line1`,
    [ctx.orgId, customerId && isUuid(customerId) ? customerId : null],
  );
  return rows.map((r) => ({
    id: r.id,
    address: `${r.line1}, ${r.postal_code} ${r.city}`.trim(),
    customerId: r.customer_id,
    customer: r.customer,
    entries: Number(r.entries),
    shared: r.shared,
  }));
}

async function loadRecord(db: Queryable, where: string, params: unknown[], today: string) {
  const h = await one<Record<string, unknown>>(
    db,
    `SELECT h.id, h.org_id, h.customer_id, h.address_key, h.line1, h.postal_code, h.city, h.share_expires_at, h.share_views,
       (h.share_token_hash IS NOT NULL AND h.share_expires_at > now()) AS shared, ${CUSTOMER} AS customer
     FROM home_records h JOIN customers c ON c.id=h.customer_id WHERE ${where}`,
    params,
  );
  if (!h) return null;
  const [jobs, entries] = await Promise.all([jobsAt(db, String(h.org_id), String(h.customer_id), String(h.address_key)), entriesOf(db, String(h.id))]);
  const items = timeline(jobs, entries, today);
  return {
    id: String(h.id),
    orgId: String(h.org_id),
    customerId: String(h.customer_id),
    customer: String(h.customer),
    address: { line1: String(h.line1), postalCode: String(h.postal_code), city: String(h.city) },
    shared: Boolean(h.shared),
    shareExpiresAt: h.share_expires_at ? new Date(h.share_expires_at as string).toISOString() : null,
    shareViews: Number(h.share_views),
    items,
    warranties: activeWarranties(items, today),
  };
}

export async function getHomeRecord(ctx: Ctx, id: string, now = new Date()) {
  if (!isUuid(id)) throw notFound("Carnet introuvable");
  const r = await loadRecord(ctx.db, "h.id=$1 AND h.org_id=$2", [id, ctx.orgId], parisDate(now));
  if (!r) throw notFound("Carnet introuvable");
  return r;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const entrySchema = z.object({
  date: z.string().regex(DATE, "Date invalide"),
  kind: z.enum(Object.keys(ENTRY_KINDS) as [EntryKind, ...EntryKind[]]),
  label: z.string().trim().min(2, "Indiquez ce qui a été fait ou installé").max(160),
  detail: z.string().trim().max(2000).default(""),
  brand: z.string().trim().max(120).default(""),
  warrantyUntil: z.union([z.literal(""), z.string().regex(DATE, "Date de garantie invalide")]).default(""),
  maintenanceMonths: z.union([z.literal(""), z.coerce.number().int().min(1).max(120)]).default(""),
});

export async function addHomeEntry(ctx: Ctx, recordId: string, raw: unknown) {
  requireWritable(ctx);
  const p = entrySchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const rec = await getHomeRecord(ctx, recordId);
  const d = p.data;
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO home_record_entries (org_id, record_id, entry_date, kind, label, detail, brand, warranty_until, maintenance_months, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      ctx.orgId,
      rec.id,
      d.date,
      d.kind,
      d.label,
      d.detail,
      d.brand,
      d.warrantyUntil || null,
      d.maintenanceMonths === "" ? null : d.maintenanceMonths,
      ctx.userId,
    ],
  );
  return r!.id;
}

export async function deleteHomeEntry(ctx: Ctx, id: string) {
  requireWritable(ctx);
  if (!isUuid(id)) throw notFound("Entrée introuvable");
  const r = await one(ctx.db, "DELETE FROM home_record_entries WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]);
  if (!r) throw notFound("Entrée introuvable");
}

/** Lien de transmission : un seul actif par carnet, valable jusqu'à un an, remplacé à chaque création. */
export async function shareHomeRecord(ctx: Ctx, id: string, days = 365, now = new Date()) {
  requireWritable(ctx);
  const rec = await getHomeRecord(ctx, id);
  const d = Math.min(365, Math.max(7, Math.round(days) || 365));
  const token = randomToken(24);
  await ctx.db.query("UPDATE home_records SET share_token_hash=$3, share_expires_at=$4, share_views=0 WHERE id=$1 AND org_id=$2", [
    rec.id,
    ctx.orgId,
    sha256(token),
    new Date(now.getTime() + d * 86_400_000),
  ]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "home_record.share", target: rec.id, data: { days: d }, ip: ctx.ip });
  return token;
}

export async function revokeHomeShare(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const rec = await getHomeRecord(ctx, id);
  await ctx.db.query("UPDATE home_records SET share_token_hash=NULL, share_expires_at=NULL WHERE id=$1 AND org_id=$2", [rec.id, ctx.orgId]);
}

/** Lecture publique du carnet ; null si le lien est inconnu, expiré ou révoqué. */
export async function sharedHomeRecord(db: Queryable, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const r = await loadRecord(db, "h.share_token_hash=$1 AND h.share_expires_at > $2", [sha256(token), now], parisDate(now));
  if (!r) return null;
  await db.query("UPDATE home_records SET share_views = share_views + 1 WHERE id=$1", [r.id]);
  const org = await one<{ name: string; phone: string; email: string; city: string }>(
    db,
    "SELECT coalesce(nullif(trade_name, ''), legal_name) AS name, phone, email, city FROM organizations WHERE id=$1",
    [r.orgId],
  );
  return { ...r, org };
}

/**
 * Reprend le carnet qu'un client a transmis : l'historique du logement (chantiers et entrées de l'autre artisan,
 * y compris ce qu'il avait lui-même repris) rejoint le carnet de cette adresse chez le nouvel artisan, avec l'auteur
 * de chaque entrée. Reprendre deux fois le même carnet n'ajoute que les nouveautés.
 */
export async function importSharedHomeRecord(ctx: Ctx, link: string, customerId: string, now = new Date()) {
  requireWritable(ctx);
  const token = shareTokenOf(link);
  if (!token) throw badRequest("Collez le lien de transmission reçu du client");
  if (!isUuid(customerId) || !(await one(ctx.db, "SELECT 1 FROM customers WHERE id=$1 AND org_id=$2", [customerId, ctx.orgId])))
    throw notFound("Client introuvable");
  const src = await loadRecord(ctx.db, "h.share_token_hash=$1 AND h.share_expires_at > $2", [sha256(token), now], parisDate(now));
  if (!src) throw notFound("Lien inconnu, expiré ou révoqué : demandez au client un nouveau lien");
  if (src.orgId === ctx.orgId) throw badRequest("Ce carnet est déjà le vôtre");
  const org = await one<{ name: string }>(ctx.db, "SELECT coalesce(nullif(trade_name, ''), legal_name) AS name FROM organizations WHERE id=$1", [src.orgId]);
  const entries = entriesToImport(src.items, org?.name ?? "").map((e) => ({ ...e, author: e.source, id: e.sourceId }));
  const r = await mergeEntries(ctx, customerId, src.address, entries, "home_record.import");
  return { ...r, total: src.items.length };
}

/** Identifiant stable d'une entrée venue d'ailleurs : repris tel quel s'il est au format attendu, dérivé sinon. */
function sourceUuid(author: string, id: string) {
  if (isUuid(id)) return id;
  const h = sha256(`${author}|${id}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Ajoute au carnet de l'adresse les entrées reçues ; une entrée déjà reprise n'est jamais dupliquée. */
async function mergeEntries(
  ctx: Ctx,
  customerId: string,
  a: { line1: string; postalCode: string; city: string },
  entries: { id: string; date: string; kind: EntryKind; label: string; detail: string; brand: string; warrantyUntil: string | null; maintenanceMonths: number | null; author: string }[],
  action: string,
) {
  const rec = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO home_records (org_id, customer_id, address_key, line1, postal_code, city) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (org_id, customer_id, address_key) DO UPDATE SET line1=home_records.line1 RETURNING id`,
    [ctx.orgId, customerId, addressKey(a.line1, a.postalCode, a.city), a.line1, a.postalCode, a.city],
  );
  let imported = 0;
  for (const e of entries) {
    const r = await ctx.db.query(
      `INSERT INTO home_record_entries (org_id, record_id, entry_date, kind, label, detail, brand, warranty_until, maintenance_months, source_name, source_entry_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (record_id, source_entry_id) WHERE source_entry_id IS NOT NULL DO NOTHING RETURNING id`,
      [
        ctx.orgId,
        rec!.id,
        e.date,
        e.kind,
        e.label.slice(0, 160),
        e.detail,
        e.brand,
        e.warrantyUntil,
        e.maintenanceMonths,
        e.author,
        sourceUuid(e.author, e.id),
        ctx.userId,
      ],
    );
    imported += r.length;
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action, target: rec!.id, data: { imported }, ip: ctx.ip });
  return { recordId: rec!.id, imported };
}

async function orgName(db: Queryable, orgId: string) {
  return (await one<{ name: string }>(db, "SELECT coalesce(nullif(trade_name, ''), legal_name) AS name FROM organizations WHERE id=$1", [orgId]))?.name ?? "";
}

/** Fichier d'échange ouvert d'un carnet de l'entreprise. */
export async function exportHomeRecord(ctx: Ctx, id: string, now = new Date()) {
  const rec = await getHomeRecord(ctx, id, now);
  return toExchange(rec, await orgName(ctx.db, ctx.orgId), now);
}

/** Fichier d'échange du carnet transmis, pour le propriétaire qui l'ouvre avec son lien. */
export async function exportSharedHomeRecord(db: Queryable, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) return null;
  const rec = await loadRecord(db, "h.share_token_hash=$1 AND h.share_expires_at > $2", [sha256(token), now], parisDate(now));
  return rec ? toExchange(rec, await orgName(db, rec.orgId), now) : null;
}

/** Reprise d'un carnet reçu en fichier, d'un autre logiciel ou gardé par le propriétaire. */
export async function importHomeRecordFile(ctx: Ctx, json: string, customerId: string) {
  requireWritable(ctx);
  if (!isUuid(customerId) || !(await one(ctx.db, "SELECT 1 FROM customers WHERE id=$1 AND org_id=$2", [customerId, ctx.orgId])))
    throw notFound("Client introuvable");
  if (json.length > 2_000_000) throw badRequest("Fichier trop lourd (2 Mo au plus)");
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw badRequest("Fichier illisible : un carnet au format JSON est attendu");
  }
  const p = parseExchange(raw);
  if (!p.ok) throw badRequest(p.error);
  const r = await mergeEntries(ctx, customerId, p.data.address, p.data.entries, "home_record.import_file");
  return { ...r, skipped: p.skipped, total: p.data.entries.length };
}
