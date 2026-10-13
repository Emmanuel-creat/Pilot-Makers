/**
 * Devis demandés aux sous-traitants : l'entreprise envoie une demande de prix par un lien sécurisé,
 * le sous-traitant répond (montant HT, délai, devis joint) sans compte, puis la réponse retenue
 * devient une ligne « sous-traitance » du devis client, avec son coût et la marge choisie.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { centsToInput } from "@/lib/calc/format";
import type { Database, Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { randomToken, sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { appUrl, sendMail } from "./mail";
import { eurosToCents } from "./pricing";
import { EDITABLE_STATUSES, type QuoteStatus } from "./quote-types";
import { getDraft, saveDraft } from "./quotes";
import { DOC_MAX_BYTES, documentType } from "./subcontractors";

export const SUB_QUOTE_DAYS = 30;

export type SubQuoteStatus = "demande" | "recu" | "retenu" | "refuse" | "annule";
export const SUB_QUOTE_STATUSES: Record<SubQuoteStatus, string> = {
  demande: "En attente de réponse",
  recu: "Prix reçu",
  retenu: "Retenu",
  refuse: "Non retenu",
  annule: "Annulé",
};

export interface SubQuote {
  id: string;
  subcontractor_id: string;
  subcontractor_name: string;
  quote_id: string | null;
  quote_number: string | null;
  quote_title: string;
  title: string;
  description: string;
  status: SubQuoteStatus;
  expires_at: Date;
  amount_ht_cents: number | null;
  delay: string;
  answer_note: string;
  answered_by: string;
  has_file: boolean;
  margin_bp: number | null;
  answered_at: Date | null;
  created_at: Date;
}

const SELECT = `SELECT sq.id, sq.subcontractor_id, s.name AS subcontractor_name, sq.quote_id, q.number AS quote_number, coalesce(q.title, '') AS quote_title,
  sq.title, sq.description, sq.status, sq.expires_at, sq.amount_ht_cents, sq.delay, sq.answer_note, sq.answered_by, (sq.file IS NOT NULL) AS has_file,
  sq.margin_bp, sq.answered_at, sq.created_at
  FROM subcontractor_quotes sq JOIN subcontractors s ON s.id=sq.subcontractor_id LEFT JOIN quotes q ON q.id=sq.quote_id`;

function mapRow(r: Record<string, unknown>): SubQuote {
  return {
    ...(r as unknown as SubQuote),
    amount_ht_cents: r.amount_ht_cents == null ? null : num(r.amount_ht_cents),
    margin_bp: r.margin_bp == null ? null : num(r.margin_bp),
  };
}

async function orgName(q: Queryable, orgId: string) {
  const o = await one<{ trade_name: string; legal_name: string; email: string }>(
    q,
    "SELECT trade_name, legal_name, email FROM organizations WHERE id=$1",
    [orgId],
  );
  return { name: o?.trade_name || o?.legal_name || "Votre donneur d'ordre", email: o?.email ?? "" };
}

const requestSchema = z.object({
  subcontractorId: z.string().refine(isUuid, "Choisissez un sous-traitant"),
  quoteId: z
    .union([z.literal(""), z.string().refine(isUuid)])
    .optional()
    .default(""),
  title: z.string().trim().min(2, "Indiquez l'objet de la demande").max(200),
  description: z.string().trim().max(4000).default(""),
  send: z.boolean().default(true),
});

/** Demande de prix à un sous-traitant ; le lien de réponse est envoyé par e-mail ou rendu pour être transmis. */
export async function requestSubQuote(ctx: Ctx, raw: unknown, now = new Date()) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const p = requestSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  const sub = await one<{ name: string; email: string; contact_name: string; archived_at: Date | null }>(
    ctx.db,
    "SELECT name, email, contact_name, archived_at FROM subcontractors WHERE id=$1 AND org_id=$2",
    [d.subcontractorId, ctx.orgId],
  );
  if (!sub) throw notFound("Sous-traitant introuvable");
  if (sub.archived_at) throw conflict("Ce sous-traitant est archivé");
  if (d.quoteId) {
    const q = await one(ctx.db, "SELECT 1 FROM quotes WHERE id=$1 AND org_id=$2", [d.quoteId, ctx.orgId]);
    if (!q) throw notFound("Devis introuvable");
  }
  const open = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM subcontractor_quotes WHERE org_id=$1 AND status='demande'", [ctx.orgId]);
  if (num(open?.n) >= 300) throw conflict("300 demandes en attente au plus");
  const token = randomToken();
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO subcontractor_quotes (org_id, subcontractor_id, quote_id, title, description, token_hash, expires_at, requested_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      ctx.orgId,
      d.subcontractorId,
      d.quoteId || null,
      d.title,
      d.description,
      sha256(token),
      new Date(now.getTime() + SUB_QUOTE_DAYS * 86_400_000),
      ctx.userId,
    ],
  );
  const url = appUrl("/st/" + token);
  let emailed = false;
  if (d.send && sub.email) {
    const org = await orgName(ctx.db, ctx.orgId);
    await sendMail(ctx.db, {
      orgId: ctx.orgId,
      kind: "subcontractor_quote",
      to: sub.email,
      subject: `${org.name} : demande de prix, ${d.title}`,
      body: `Bonjour${sub.contact_name ? " " + sub.contact_name : ""},\n\n${org.name} vous demande un prix pour : ${d.title}.\n${
        d.description ? `\n${d.description}\n` : ""
      }\nIndiquez votre montant hors taxes et votre délai, et joignez votre devis si vous le souhaitez, sans créer de compte :\n${url}\n\nCe lien est valable ${SUB_QUOTE_DAYS} jours.\n\nCordialement,\n${ctx.userName}, ${org.name}`,
    });
    emailed = true;
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "subquote.request", target: r!.id, data: { emailed }, ip: ctx.ip });
  return { id: r!.id, url, emailed };
}

export async function listSubQuotes(ctx: Ctx, f: { quoteId?: string; subcontractorId?: string } = {}) {
  requirePermission(ctx, "costs");
  const where = ["sq.org_id=$1"];
  const args: unknown[] = [ctx.orgId];
  if (f.quoteId) {
    if (!isUuid(f.quoteId)) return [];
    args.push(f.quoteId);
    where.push(`sq.quote_id=$${args.length}`);
  }
  if (f.subcontractorId) {
    if (!isUuid(f.subcontractorId)) return [];
    args.push(f.subcontractorId);
    where.push(`sq.subcontractor_id=$${args.length}`);
  }
  const rows = await ctx.db.query<Record<string, unknown>>(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY sq.created_at DESC LIMIT 200`, args);
  return rows.map(mapRow);
}

async function getSubQuote(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Demande introuvable");
  const r = await one<Record<string, unknown>>(ctx.db, `${SELECT} WHERE sq.id=$1 AND sq.org_id=$2`, [id, ctx.orgId]);
  if (!r) throw notFound("Demande introuvable");
  return mapRow(r);
}

const answerSchema = z.object({
  amount: z.string().trim().min(1, "Indiquez le montant hors taxes").max(30),
  delay: z.string().trim().max(200).default(""),
  note: z.string().trim().max(3000).default(""),
  name: z.string().trim().max(120).default(""),
});

function parseAnswer(raw: unknown, file: Uint8Array | null) {
  const p = answerSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const cents = eurosToCents(p.data.amount, "Montant hors taxes");
  if (cents <= 0) throw badRequest("Le montant doit être positif");
  if (cents > 100_000_000_00) throw badRequest("Montant trop élevé");
  let type = "";
  if (file) {
    if (file.length > DOC_MAX_BYTES) throw badRequest("Fichier trop lourd (5 Mo au plus)");
    type = documentType(file) ?? "";
    if (!type) throw badRequest("Format non reconnu : PDF, JPEG ou PNG");
  }
  return { ...p.data, cents, type };
}

async function storeAnswer(q: Queryable, id: string, a: ReturnType<typeof parseAnswer>, file: Uint8Array | null, fileName: string, now: Date) {
  await q.query(
    `UPDATE subcontractor_quotes SET status='recu', amount_ht_cents=$2, delay=$3, answer_note=$4, answered_by=$5, answered_at=$6,
       file=coalesce($7, file), file_name=CASE WHEN $7::bytea IS NULL THEN file_name ELSE $8 END,
       file_type=CASE WHEN $7::bytea IS NULL THEN file_type ELSE $9 END, file_sha256=CASE WHEN $7::bytea IS NULL THEN file_sha256 ELSE $10 END
     WHERE id=$1`,
    [id, a.cents, a.delay, a.note, a.name, now, file, fileName.replace(/[^\w.\- ]/g, "_").slice(0, 120), a.type, file ? sha256(file) : ""],
  );
}

/** Saisie par l'entreprise d'un prix reçu autrement (téléphone, e-mail, papier). */
export async function recordSubQuote(ctx: Ctx, id: string, raw: unknown, file: Uint8Array | null = null, fileName = "", now = new Date()) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const sq = await getSubQuote(ctx, id);
  if (sq.status !== "demande" && sq.status !== "recu") throw conflict("Cette demande est close");
  const f = file && file.length ? file : null;
  const a = parseAnswer({ ...(raw as object), name: ctx.userName }, f);
  await storeAnswer(ctx.db, id, a, f, fileName, now);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "subquote.record", target: id, ip: ctx.ip });
}

async function resolveToken(q: Queryable, token: string, now: Date) {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const r = await one<{ id: string; org_id: string; status: SubQuoteStatus; expires_at: Date }>(
    q,
    "SELECT id, org_id, status, expires_at FROM subcontractor_quotes WHERE token_hash=$1",
    [sha256(token)],
  );
  if (!r) return null;
  const org = await one<{ status: string }>(q, "SELECT status FROM organizations WHERE id=$1", [r.org_id]);
  if (org?.status !== "active") return null;
  return { ...r, expired: r.expires_at < now };
}

/** Page de réponse du sous-traitant : ce qui lui est demandé et sa réponse éventuelle. */
export async function publicSubQuote(db: Database, token: string, meta: { ip: string }, now = new Date()) {
  await hitRate(db, "public.view", meta.ip);
  const t = await resolveToken(db, token, now);
  if (!t) return null;
  const r = await one<Record<string, unknown>>(db, `${SELECT} WHERE sq.id=$1`, [t.id]);
  const sq = mapRow(r!);
  const org = await orgName(db, t.org_id);
  return {
    orgName: org.name,
    subcontractorName: sq.subcontractor_name,
    title: sq.title,
    description: sq.description,
    status: sq.status,
    expired: t.expired,
    canAnswer: !t.expired && (sq.status === "demande" || sq.status === "recu"),
    answer: sq.amount_ht_cents == null ? null : { amountCents: sq.amount_ht_cents, delay: sq.delay, note: sq.answer_note, hasFile: sq.has_file },
  };
}

/** Réponse du sous-traitant, sans compte ; il peut la corriger tant que l'entreprise n'a pas décidé. */
export async function answerSubQuote(
  db: Database,
  token: string,
  raw: unknown,
  file: Uint8Array | null,
  fileName: string,
  meta: { ip: string },
  now = new Date(),
) {
  await hitRate(db, "public.respond", meta.ip);
  const t = await resolveToken(db, token, now);
  if (!t) throw notFound("Lien invalide ou expiré");
  if (t.expired) throw conflict("Ce lien a expiré : demandez-en un nouveau à l'entreprise");
  if (t.status !== "demande" && t.status !== "recu") throw conflict("Cette demande est close");
  const f = file && file.length ? file : null;
  const a = parseAnswer(raw, f);
  await storeAnswer(db, t.id, a, f, fileName, now);
  const r = await one<Record<string, unknown>>(db, `${SELECT} WHERE sq.id=$1`, [t.id]);
  const sq = mapRow(r!);
  const org = await orgName(db, t.org_id);
  if (org.email) {
    await sendMail(db, {
      orgId: t.org_id,
      kind: "notification",
      to: org.email,
      subject: `${sq.subcontractor_name} a répondu : ${sq.title}`,
      body: `${sq.subcontractor_name} propose ${centsToInput(a.cents)} euros HT pour « ${sq.title} »${a.delay ? `, délai : ${a.delay}` : ""}.\n\nVoir la réponse : ${appUrl(
        sq.quote_id ? `/app/devis/${sq.quote_id}#sous-traitance` : `/app/sous-traitants/${sq.subcontractor_id}`,
      )}`,
    });
  }
  await audit(db, { orgId: t.org_id, action: "subquote.answer", target: t.id, ip: meta.ip });
}

export function parseMarginBp(input: string): number {
  const s = String(input ?? "")
    .trim()
    .replace(/\s|%/g, "")
    .replace(",", ".");
  if (!s) return 0;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) throw badRequest("Marge invalide : un pourcentage entre 0 et 300");
  const bp = Math.round(Number(s) * 100);
  if (bp > 30_000) throw badRequest("Marge invalide : un pourcentage entre 0 et 300");
  return bp;
}

/** Prix de vente HT d'un coût de sous-traitance, avec la marge appliquée sur le coût. */
export function salePriceCents(costCents: number, marginBp: number) {
  return Math.round((costCents * (10_000 + marginBp)) / 10_000);
}

/**
 * Intègre le prix retenu au devis client (brouillon) : une ligne « sous-traitance » au forfait, avec le coût
 * du sous-traitant en coût de revient et le prix de vente majoré de la marge. Les autres réponses à la même
 * demande sur ce devis restent consultables.
 */
export async function integrateSubQuote(ctx: Ctx, id: string, raw: { quoteId?: string; margin?: string; vatPercent?: string }, now = new Date()) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  const sq = await getSubQuote(ctx, id);
  if (sq.status !== "recu" || sq.amount_ht_cents == null) throw conflict("Aucun prix à intégrer pour cette demande");
  const quoteId = raw.quoteId || sq.quote_id;
  if (!quoteId) throw badRequest("Choisissez le devis client");
  const marginBp = parseMarginBp(raw.margin ?? "");
  const draft = await getDraft(ctx, quoteId);
  if (!EDITABLE_STATUSES.includes(draft.status as QuoteStatus)) throw conflict("Ce devis a été émis : créez une nouvelle version pour le modifier");
  const org = await one<{ default_vat_bp: unknown }>(ctx.db, "SELECT default_vat_bp FROM organizations WHERE id=$1", [ctx.orgId]);
  const vat = raw.vatPercent?.trim() || String(num(org?.default_vat_bp ?? 2000) / 100).replace(".", ",");
  const lineId = randomUUID();
  const line = {
    id: lineId,
    kind: "item" as const,
    catalogItemId: null,
    nature: "sous_traitance" as const,
    label: sq.title,
    description: [sq.description, sq.delay ? `Délai : ${sq.delay}` : ""].filter(Boolean).join("\n").slice(0, 4000),
    quantity: "1",
    unit: "forfait",
    unitPrice: centsToInput(salePriceCents(sq.amount_ht_cents, marginBp)),
    unitCost: centsToInput(sq.amount_ht_cents),
    discountPercent: "",
    vatPercent: vat,
    estimated: false,
    estimateNote: "",
    internalNote: `Sous-traitance : ${sq.subcontractor_name}, ${centsToInput(sq.amount_ht_cents)} euros HT${marginBp ? `, marge ${marginBp / 100} %` : ""}`,
  };
  const sections = draft.sections.length ? draft.sections.map((s) => ({ ...s })) : [{ id: randomUUID(), title: "", description: "", lines: [] }];
  const last = sections[sections.length - 1];
  sections[sections.length - 1] = { ...last, lines: [...last.lines, line as never] };
  await saveDraft(ctx, quoteId, { ...draft, sections }, draft.draftRevision);
  await ctx.db.query("UPDATE subcontractor_quotes SET status='retenu', quote_id=$2, margin_bp=$3, line_id=$4, decided_at=$5 WHERE id=$1", [
    id,
    quoteId,
    marginBp,
    lineId,
    now,
  ]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "subquote.integrate", target: id, data: { quoteId, marginBp }, ip: ctx.ip });
  return { quoteId, lineId };
}

/** Refus d'une réponse ou annulation d'une demande : le lien de réponse se ferme. */
export async function decideSubQuote(ctx: Ctx, id: string, decision: "refuse" | "annule", now = new Date()) {
  requireWritable(ctx);
  requirePermission(ctx, "costs");
  if (decision !== "refuse" && decision !== "annule") throw badRequest("Décision inconnue");
  const sq = await getSubQuote(ctx, id);
  if (decision === "refuse" && sq.status !== "recu") throw conflict("Seul un prix reçu peut être écarté");
  if (decision === "annule" && sq.status !== "demande") throw conflict("Seule une demande en attente peut être annulée");
  await ctx.db.query("UPDATE subcontractor_quotes SET status=$2, decided_at=$3, token_hash=NULL WHERE id=$1", [id, decision, now]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "subquote." + decision, target: id, ip: ctx.ip });
}

export async function subQuoteFile(ctx: Ctx, id: string) {
  requirePermission(ctx, "costs");
  if (!isUuid(id)) throw notFound("Fichier introuvable");
  const r = await one<{ file: Uint8Array | null; file_name: string; file_type: string }>(
    ctx.db,
    "SELECT file, file_name, file_type FROM subcontractor_quotes WHERE id=$1 AND org_id=$2",
    [id, ctx.orgId],
  );
  if (!r?.file) throw notFound("Fichier introuvable");
  return { bytes: r.file, name: r.file_name || "devis-sous-traitant", type: r.file_type || "application/octet-stream" };
}

/** Devis encore modifiables, pour rattacher une demande ou intégrer un prix. */
export async function draftQuoteChoices(ctx: Ctx) {
  const rows = await ctx.db.query<{ id: string; title: string; customer: string | null }>(
    `SELECT q.id, q.title, coalesce(nullif(c.company_name, ''), trim(c.first_name || ' ' || c.last_name)) AS customer
     FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id
     WHERE q.org_id=$1 AND q.status IN ('draft', 'incomplete') AND q.archived_at IS NULL ORDER BY q.updated_at DESC LIMIT 100`,
    [ctx.orgId],
  );
  return rows.map((r) => ({ id: r.id, label: [r.title || "Brouillon sans titre", r.customer].filter(Boolean).join(", ") }));
}
