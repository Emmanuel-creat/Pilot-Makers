/**
 * Sous-traitants : fiche, documents (attestation de vigilance URSSAF, assurance décennale, RC Pro,
 * Kbis, contrat), dates d'expiration avec alertes et relances, affectation aux chantiers.
 *
 * Obligation de vigilance (Code du travail, art. L8222-1 et D8222-5) : pour tout contrat d'au moins
 * 5 000 euros HT, le donneur d'ordre se fait remettre l'attestation URSSAF à la signature puis tous
 * les six mois jusqu'à la fin des travaux.
 */

import { requireCleanFile } from "@/lib/file-scan";
import { z } from "zod";
import type { Database } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { sha256 } from "@/lib/security";
import { cleanId, validateSiret } from "@/lib/validation/identifiers";
import type { Ctx } from "./context";
import { audit, can, requirePermission, requireWritable } from "./context";
import { getJob } from "./jobs";
import { sendMail } from "./mail";
import { eurosToCents } from "./pricing";
import { parisDate } from "./quotes";

export const DOC_KINDS = {
  urssaf: "Attestation de vigilance URSSAF",
  decennale: "Assurance décennale",
  rc_pro: "Responsabilité civile professionnelle",
  kbis: "Extrait Kbis ou avis de situation",
  contrat: "Contrat de sous-traitance",
  autre: "Autre document",
} as const;
export type DocKind = keyof typeof DOC_KINDS;

/** Documents exigés de chaque sous-traitant */
export const REQUIRED_KINDS: DocKind[] = ["urssaf", "decennale"];
/** Seuil de l'obligation de vigilance, en centimes HT */
export const VIGILANCE_THRESHOLD_CENTS = 500_000;
export const SOON_DAYS = 30;
export const DOC_MAX_BYTES = 5_000_000;
const URSSAF_MONTHS = 6;

export type DocStatus = "valide" | "bientot" | "expire" | "manquant";
const RANK: Record<DocStatus, number> = { valide: 0, bientot: 1, manquant: 2, expire: 3 };
export const STATUS_LABELS: Record<DocStatus, string> = {
  valide: "À jour",
  bientot: "Expire bientôt",
  expire: "Expiré",
  manquant: "Manquant",
};

const DAY = 86_400_000;
const iso = (v: unknown) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);
const addMonths = (isoDate: string, months: number) => {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

export function docStatus(validUntil: string | null, today: string): DocStatus {
  if (!validUntil) return "valide";
  if (validUntil < today) return "expire";
  const days = (new Date(`${validUntil}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / DAY;
  return days <= SOON_DAYS ? "bientot" : "valide";
}

export interface SubDocument {
  id: string;
  kind: DocKind;
  label: string;
  valid_until: string | null;
  file_name: string;
  has_file: boolean;
  uploaded_at: Date;
  status: DocStatus;
}

export interface Compliance {
  status: DocStatus;
  /** Par document exigé : date de fin du plus récent et état */
  required: { kind: DocKind; label: string; validUntil: string | null; status: DocStatus }[];
}

/** État des documents exigés : le plus récent de chaque type compte. */
export function compliance(docs: { kind: DocKind; valid_until: string | null }[], today: string): Compliance {
  const required = REQUIRED_KINDS.map((kind) => {
    const list = docs.filter((d) => d.kind === kind);
    if (!list.length) return { kind, label: DOC_KINDS[kind], validUntil: null, status: "manquant" as DocStatus };
    // Sans date de fin, le document est considéré valable sans limite.
    const best = list.reduce((a, b) => ((a.valid_until ?? "9999") >= (b.valid_until ?? "9999") ? a : b));
    return { kind, label: DOC_KINDS[kind], validUntil: best.valid_until, status: docStatus(best.valid_until, today) };
  });
  const status = required.reduce<DocStatus>((w, r) => (RANK[r.status] > RANK[w] ? r.status : w), "valide");
  return { status, required };
}

/* ------------------------------------------------------------------ */
/* Fiches                                                               */
/* ------------------------------------------------------------------ */

const subSchema = z.object({
  name: z.string().trim().min(1, "Nom du sous-traitant requis").max(160),
  siret: z.string().trim().max(30).default(""),
  trade: z.string().trim().max(80).default(""),
  contactName: z.string().trim().max(120).default(""),
  email: z.union([z.literal(""), z.string().trim().email("Adresse e-mail invalide").max(200)]).default(""),
  phone: z.string().trim().max(40).default(""),
  notes: z.string().trim().max(2000).default(""),
  autoRemind: z.boolean().default(false),
});

function parseSub(raw: unknown) {
  const p = subSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const siretError = validateSiret(p.data.siret);
  if (siretError) throw badRequest(siretError);
  if (p.data.autoRemind && !p.data.email) throw badRequest("Indiquez l'adresse e-mail pour les relances automatiques");
  return { ...p.data, siret: cleanId(p.data.siret) };
}

export async function createSubcontractor(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const d = parseSub(raw);
  const n = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM subcontractors WHERE org_id=$1", [ctx.orgId]);
  if (num(n?.n) >= 500) throw conflict("500 sous-traitants au plus");
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO subcontractors (org_id, name, siret, trade, contact_name, email, phone, notes, auto_remind)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [ctx.orgId, d.name, d.siret, d.trade, d.contactName, d.email, d.phone, d.notes, d.autoRemind],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "subcontractor.create", target: r!.id, ip: ctx.ip });
  return r!.id;
}

export async function updateSubcontractor(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const d = parseSub(raw);
  const r = await ctx.db.query(
    `UPDATE subcontractors SET name=$3, siret=$4, trade=$5, contact_name=$6, email=$7, phone=$8, notes=$9, auto_remind=$10
     WHERE id=$1 AND org_id=$2 RETURNING id`,
    [isUuid(id) ? id : null, ctx.orgId, d.name, d.siret, d.trade, d.contactName, d.email, d.phone, d.notes, d.autoRemind],
  );
  if (!r.length) throw notFound("Sous-traitant introuvable");
}

export async function setSubcontractorArchived(ctx: Ctx, id: string, archived: boolean) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const r = await ctx.db.query(`UPDATE subcontractors SET archived_at=${archived ? "now()" : "NULL"} WHERE id=$1 AND org_id=$2 RETURNING id`, [
    isUuid(id) ? id : null,
    ctx.orgId,
  ]);
  if (!r.length) throw notFound("Sous-traitant introuvable");
}

async function docsFor(db: Database, ids: string[], today: string) {
  if (!ids.length) return new Map<string, SubDocument[]>();
  const rows = await db.query<Record<string, unknown>>(
    `SELECT id, subcontractor_id, kind, label, valid_until, file_name, file IS NOT NULL AS has_file, uploaded_at
     FROM subcontractor_documents WHERE subcontractor_id = ANY($1::uuid[]) ORDER BY uploaded_at DESC`,
    [ids],
  );
  const map = new Map<string, SubDocument[]>();
  for (const r of rows) {
    const d: SubDocument = {
      id: String(r.id),
      kind: r.kind as DocKind,
      label: String(r.label),
      valid_until: iso(r.valid_until),
      file_name: String(r.file_name),
      has_file: !!r.has_file,
      uploaded_at: r.uploaded_at as Date,
      status: docStatus(iso(r.valid_until), today),
    };
    const k = String(r.subcontractor_id);
    map.set(k, [...(map.get(k) ?? []), d]);
  }
  return map;
}

export interface Subcontractor {
  id: string;
  name: string;
  siret: string;
  trade: string;
  contact_name: string;
  email: string;
  phone: string;
  notes: string;
  auto_remind: boolean;
  last_reminder_at: Date | null;
  archived_at: Date | null;
}

export async function listSubcontractors(ctx: Ctx, opts: { archived?: boolean } = {}, now = new Date()) {
  requirePermission(ctx, "costs");
  const rows = await ctx.db.query<Subcontractor>(
    `SELECT id, name, siret, trade, contact_name, email, phone, notes, auto_remind, last_reminder_at, archived_at
     FROM subcontractors WHERE org_id=$1 AND archived_at IS ${opts.archived ? "NOT NULL" : "NULL"} ORDER BY lower(name)`,
    [ctx.orgId],
  );
  const today = parisDate(now);
  const docs = await docsFor(
    ctx.db,
    rows.map((r) => r.id),
    today,
  );
  return rows.map((r) => ({ ...r, compliance: compliance(docs.get(r.id) ?? [], today) }));
}

export async function getSubcontractor(ctx: Ctx, id: string, now = new Date()) {
  requirePermission(ctx, "costs");
  if (!isUuid(id)) throw notFound("Sous-traitant introuvable");
  const sub = await one<Subcontractor>(
    ctx.db,
    `SELECT id, name, siret, trade, contact_name, email, phone, notes, auto_remind, last_reminder_at, archived_at
     FROM subcontractors WHERE id=$1 AND org_id=$2`,
    [id, ctx.orgId],
  );
  if (!sub) throw notFound("Sous-traitant introuvable");
  const today = parisDate(now);
  const documents = (await docsFor(ctx.db, [id], today)).get(id) ?? [];
  const jobs = await ctx.db.query<{ job_id: string; title: string; status: string; scope: string; amount_ht_cents: unknown }>(
    `SELECT s.job_id, j.title, j.status, s.scope, s.amount_ht_cents FROM job_subcontractors s JOIN jobs j ON j.id=s.job_id
     WHERE s.subcontractor_id=$1 ORDER BY s.created_at DESC`,
    [id],
  );
  return {
    sub,
    documents,
    compliance: compliance(documents, today),
    jobs: jobs.map((j) => ({ ...j, amount_ht_cents: num(j.amount_ht_cents) })),
  };
}

/* ------------------------------------------------------------------ */
/* Documents                                                            */
/* ------------------------------------------------------------------ */

/** Type réel du fichier d'après ses premiers octets : PDF, JPEG ou PNG. */
export function documentType(bytes: Uint8Array): "application/pdf" | "image/jpeg" | "image/png" | null {
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

export async function addDocument(
  ctx: Ctx,
  subId: string,
  input: { kind: string; label?: string; validUntil?: string; file?: Uint8Array | null; fileName?: string },
  now = new Date(),
) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  await getSubcontractor(ctx, subId, now);
  if (!(input.kind in DOC_KINDS)) throw badRequest("Type de document inconnu");
  const kind = input.kind as DocKind;
  const file = input.file && input.file.length ? input.file : null;
  let type = "";
  if (file) {
    if (file.length > DOC_MAX_BYTES) throw badRequest("Fichier trop lourd (5 Mo au plus)");
    type = documentType(file) ?? "";
    if (!type) throw badRequest("Format non reconnu : PDF, JPEG ou PNG");
    await requireCleanFile(file, (r) => audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "file.rejected", target: subId, data: r, ip: ctx.ip }));
  }
  let validUntil = (input.validUntil ?? "").trim();
  if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) throw badRequest("Date de fin de validité invalide");
  // L'attestation de vigilance vaut six mois : sans date indiquée, on compte à partir d'aujourd'hui.
  if (!validUntil && kind === "urssaf") validUntil = addMonths(parisDate(now), URSSAF_MONTHS);
  if (!file && !validUntil && kind !== "contrat" && kind !== "autre") throw badRequest("Joignez le document ou indiquez sa date de fin de validité");
  const count = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM subcontractor_documents WHERE subcontractor_id=$1", [subId]);
  if (num(count?.n) >= 200) throw conflict("200 documents au plus par sous-traitant");
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO subcontractor_documents (org_id, subcontractor_id, kind, label, valid_until, file, file_name, file_type, file_sha256, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      ctx.orgId,
      subId,
      kind,
      String(input.label ?? "")
        .trim()
        .slice(0, 160),
      validUntil || null,
      file,
      String(input.fileName ?? "")
        .replace(/[^\w.\- ]/g, "_")
        .slice(0, 120),
      type,
      file ? sha256(file) : "",
      ctx.userId,
    ],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "subcontractor.document", target: subId, data: { kind }, ip: ctx.ip });
  return r!.id;
}

export async function deleteDocument(ctx: Ctx, docId: string) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const r = await ctx.db.query("DELETE FROM subcontractor_documents WHERE id=$1 AND org_id=$2 RETURNING subcontractor_id", [
    isUuid(docId) ? docId : null,
    ctx.orgId,
  ]);
  if (!r.length) throw notFound("Document introuvable");
}

export async function documentFile(ctx: Ctx, docId: string) {
  requirePermission(ctx, "costs");
  const r = await one<{ file: Uint8Array | null; file_type: string; file_name: string; kind: DocKind }>(
    ctx.db,
    "SELECT file, file_type, file_name, kind FROM subcontractor_documents WHERE id=$1 AND org_id=$2",
    [isUuid(docId) ? docId : null, ctx.orgId],
  );
  if (!r?.file) throw notFound("Document introuvable");
  return { bytes: r.file, type: r.file_type || "application/octet-stream", name: r.file_name || `${r.kind}.pdf` };
}

/* ------------------------------------------------------------------ */
/* Chantiers                                                            */
/* ------------------------------------------------------------------ */

export async function addToJob(ctx: Ctx, jobId: string, raw: { subcontractorId: string; scope?: string; amount?: string }) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  await getJob(ctx, jobId);
  if (!isUuid(raw.subcontractorId)) throw badRequest("Choisissez un sous-traitant");
  const sub = await one(ctx.db, "SELECT 1 FROM subcontractors WHERE id=$1 AND org_id=$2 AND archived_at IS NULL", [raw.subcontractorId, ctx.orgId]);
  if (!sub) throw notFound("Sous-traitant introuvable");
  let cents = 0;
  const amount = String(raw.amount ?? "").replace(/[\s€]/g, "");
  if (amount) {
    try {
      cents = eurosToCents(amount, "Montant");
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    if (cents < 0) throw badRequest("Montant invalide");
  }
  await ctx.db.query(
    `INSERT INTO job_subcontractors (org_id, job_id, subcontractor_id, scope, amount_ht_cents) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (job_id, subcontractor_id) DO UPDATE SET scope=EXCLUDED.scope, amount_ht_cents=EXCLUDED.amount_ht_cents`,
    [
      ctx.orgId,
      jobId,
      raw.subcontractorId,
      String(raw.scope ?? "")
        .trim()
        .slice(0, 200),
      cents,
    ],
  );
}

export async function removeFromJob(ctx: Ctx, jobId: string, subId: string) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  await ctx.db.query("DELETE FROM job_subcontractors WHERE job_id=$1 AND subcontractor_id=$2 AND org_id=$3", [
    isUuid(jobId) ? jobId : null,
    isUuid(subId) ? subId : null,
    ctx.orgId,
  ]);
}

/** Sous-traitants d'un chantier, avec l'état de leurs documents et l'obligation de vigilance. */
export async function jobSubcontractors(ctx: Ctx, jobId: string, now = new Date()) {
  requirePermission(ctx, "costs");
  const rows = await ctx.db.query<{ id: string; name: string; trade: string; scope: string; amount_ht_cents: unknown }>(
    `SELECT s.id, s.name, s.trade, js.scope, js.amount_ht_cents FROM job_subcontractors js JOIN subcontractors s ON s.id=js.subcontractor_id
     WHERE js.job_id=$1 AND js.org_id=$2 ORDER BY lower(s.name)`,
    [jobId, ctx.orgId],
  );
  const today = parisDate(now);
  const docs = await docsFor(
    ctx.db,
    rows.map((r) => r.id),
    today,
  );
  return rows.map((r) => {
    const cents = num(r.amount_ht_cents);
    return { ...r, amount_ht_cents: cents, vigilance: cents >= VIGILANCE_THRESHOLD_CENTS, compliance: compliance(docs.get(r.id) ?? [], today) };
  });
}

/* ------------------------------------------------------------------ */
/* Alertes et relances                                                  */
/* ------------------------------------------------------------------ */

/** Sous-traitants actifs dont un document exigé manque, expire bientôt ou a expiré. */
export async function subcontractorAlerts(ctx: Ctx, now = new Date()) {
  if (!can(ctx, "costs")) return [];
  const subs = await listSubcontractors(ctx, {}, now);
  return subs
    .filter((s) => s.compliance.status !== "valide")
    .map((s) => ({ id: s.id, name: s.name, status: s.compliance.status }))
    .sort((a, b) => RANK[b.status] - RANK[a.status]);
}

function reminderBody(orgName: string, contact: string, items: Compliance["required"]) {
  const lines = items.map((i) =>
    i.status === "manquant"
      ? `- ${i.label} : non reçu`
      : `- ${i.label} : ${i.status === "expire" ? "expiré le" : "expire le"} ${new Date(`${i.validUntil}T12:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })}`,
  );
  return [
    `Bonjour${contact ? ` ${contact}` : ""},`,
    "",
    `Pour poursuivre notre collaboration, ${orgName} a besoin de la version à jour des documents suivants :`,
    "",
    ...lines,
    "",
    "Merci de nous les transmettre en réponse à ce message.",
    "",
    "Cordialement,",
    orgName,
  ].join("\n");
}

/** Demande des documents à jour au sous-traitant, par e-mail. */
export async function requestDocuments(ctx: Ctx, subId: string, now = new Date()) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const { sub, compliance: c } = await getSubcontractor(ctx, subId, now);
  if (!sub.email) throw badRequest("Indiquez l'adresse e-mail du sous-traitant");
  const items = c.required.filter((r) => r.status !== "valide");
  if (!items.length) throw conflict("Tous les documents exigés sont à jour");
  const org = await one<{ trade_name: string; legal_name: string }>(ctx.db, "SELECT trade_name, legal_name FROM organizations WHERE id=$1", [
    ctx.orgId,
  ]);
  const orgName = org?.trade_name || org?.legal_name || "Votre donneur d'ordre";
  await sendMail(ctx.db, {
    orgId: ctx.orgId,
    kind: "subcontractor_documents",
    to: sub.email,
    subject: `${orgName} : documents à mettre à jour`,
    body: reminderBody(orgName, sub.contact_name, items),
  });
  await ctx.db.query("UPDATE subcontractors SET last_reminder_at=$2 WHERE id=$1", [subId, now]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "subcontractor.remind", target: subId, ip: ctx.ip });
}

/**
 * Relances automatiques (tâche planifiée quotidienne) : pour les sous-traitants qui l'ont activée,
 * un e-mail quand un document exigé expire dans 15 jours ou a expiré, au plus une fois par semaine.
 */
export async function runSubcontractorReminders(db: Database, now = new Date()) {
  const today = parisDate(now);
  const subs = await db.query<{ id: string; org_id: string; email: string; contact_name: string; trade_name: string; legal_name: string }>(
    `SELECT s.id, s.org_id, s.email, s.contact_name, o.trade_name, o.legal_name FROM subcontractors s JOIN organizations o ON o.id=s.org_id
     WHERE s.auto_remind AND s.archived_at IS NULL AND s.email <> '' AND o.status='active'
       AND (s.last_reminder_at IS NULL OR s.last_reminder_at < $1)
     LIMIT 500`,
    [new Date(now.getTime() - 7 * DAY)],
  );
  const docs = await docsFor(
    db,
    subs.map((s) => s.id),
    today,
  );
  let sent = 0;
  for (const s of subs) {
    const c = compliance(docs.get(s.id) ?? [], today);
    const items = c.required.filter(
      (r) =>
        r.status === "expire" ||
        (r.validUntil && (new Date(`${r.validUntil}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / DAY <= 15),
    );
    // Un document jamais reçu se demande à la main : la relance automatique suit les expirations.
    if (!items.length) continue;
    const orgName = s.trade_name || s.legal_name || "Votre donneur d'ordre";
    await sendMail(db, {
      orgId: s.org_id,
      kind: "subcontractor_documents",
      to: s.email,
      subject: `${orgName} : documents à mettre à jour`,
      body: reminderBody(orgName, s.contact_name, items),
      idempotencyKey: `sub-remind:${s.id}:${today}`,
    });
    await db.query("UPDATE subcontractors SET last_reminder_at=$2 WHERE id=$1", [s.id, now]);
    sent++;
  }
  return { sent };
}
