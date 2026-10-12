/**
 * Demandes entrantes : un appel, un message, une recommandation. Chaque demande a un statut
 * et une prochaine action datée, puis devient un client et un devis en un geste.
 */

import { z } from "zod";
import { one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { validateEmail } from "@/lib/validation/identifiers";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import { createCustomer } from "./customers";
import { createQuote } from "./quotes";
import type { QuoteStatus } from "./quote-types";

import { LEAD_SOURCES, LEAD_STATUSES, OPEN_LEAD_STATUSES, SOURCE_CODES, STATUS_CODES, type LeadStatus } from "./leads-labels";

export { LEAD_SOURCES, LEAD_STATUSES, OPEN_LEAD_STATUSES, type LeadStatus };

export interface Lead {
  id: string;
  customer_id: string | null;
  quote_id: string | null;
  name: string;
  email: string;
  phone: string;
  city: string;
  description: string;
  source: keyof typeof LEAD_SOURCES;
  status: LeadStatus;
  next_action: string;
  next_action_on: string | null;
  created_at: Date;
  quote_number?: string | null;
  quote_status?: QuoteStatus | null;
}

const date = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null));

const leadSchema = z.object({
  name: z.string().trim().min(2, "Indiquez le nom de la personne").max(160),
  email: z.string().trim().max(254).optional().default(""),
  phone: z.string().trim().max(30).optional().default(""),
  city: z.string().trim().max(120).optional().default(""),
  description: z.string().trim().max(4000).optional().default(""),
  source: z.enum(SOURCE_CODES).default("telephone"),
  next_action: z.string().trim().max(300).optional().default(""),
  next_action_on: date,
});

const patchSchema = z.object({
  status: z.enum(STATUS_CODES).optional(),
  next_action: z.string().trim().max(300).optional(),
  next_action_on: date,
  description: z.string().trim().max(4000).optional(),
});

function mapLead(r: Record<string, unknown>): Lead {
  const d = r.next_action_on;
  return {
    ...(r as unknown as Lead),
    next_action_on: d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : null,
  };
}

export async function createLead(ctx: Ctx, raw: unknown): Promise<string> {
  requireWritable(ctx);
  const parsed = leadSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const l = parsed.data;
  const e = validateEmail(l.email);
  if (e) throw badRequest(e);
  if (!l.email && !l.phone) throw badRequest("Indiquez au moins un téléphone ou une adresse e-mail");
  const row = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO leads (org_id, name, email, phone, city, description, source, next_action, next_action_on, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [ctx.orgId, l.name, l.email.toLowerCase(), l.phone, l.city, l.description, l.source, l.next_action, l.next_action_on, ctx.userId],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "lead.create", target: row!.id, ip: ctx.ip });
  return row!.id;
}

export async function listLeads(ctx: Ctx, f: { open?: boolean } = {}): Promise<Lead[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT l.*, q.number AS quote_number, q.status AS quote_status FROM leads l LEFT JOIN quotes q ON q.id = l.quote_id
     WHERE l.org_id=$1 ${f.open ? "AND l.status = ANY($2)" : ""}
     ORDER BY (l.status IN ('gagnee','perdue')), l.next_action_on NULLS LAST, l.created_at DESC LIMIT 500`,
    f.open ? [ctx.orgId, OPEN_LEAD_STATUSES] : [ctx.orgId],
  );
  return rows.map(syncStatus);
}

/** Le statut suit le devis rattaché : accepté, la demande est gagnée ; refusé ou expiré, elle est perdue. */
function syncStatus(r: Record<string, unknown>): Lead {
  const l = mapLead(r);
  if (l.status === "devis" && l.quote_status === "accepted") return { ...l, status: "gagnee" };
  if (l.status === "devis" && (l.quote_status === "refused" || l.quote_status === "expired")) return { ...l, status: "perdue" };
  return l;
}

export async function getLead(ctx: Ctx, id: string): Promise<Lead> {
  if (!isUuid(id)) throw notFound("Demande introuvable");
  const r = await one<Record<string, unknown>>(
    ctx.db,
    "SELECT l.*, q.number AS quote_number, q.status AS quote_status FROM leads l LEFT JOIN quotes q ON q.id = l.quote_id WHERE l.id=$1 AND l.org_id=$2",
    [id, ctx.orgId],
  );
  if (!r) throw notFound("Demande introuvable");
  return syncStatus(r);
}

export async function updateLead(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const p = parsed.data;
  await getLead(ctx, id);
  await ctx.db.query(
    `UPDATE leads SET status=coalesce($3, status), next_action=coalesce($4, next_action),
       next_action_on=CASE WHEN $5::boolean THEN $6::date ELSE next_action_on END, description=coalesce($7, description), updated_at=now()
     WHERE id=$1 AND org_id=$2`,
    [id, ctx.orgId, p.status ?? null, p.next_action ?? null, "next_action_on" in (raw as object), p.next_action_on, p.description ?? null],
  );
}

/** Transforme la demande en client (s'il n'existe pas encore) et en devis brouillon. */
export async function convertLeadToQuote(ctx: Ctx, id: string): Promise<string> {
  requireWritable(ctx);
  const lead = await getLead(ctx, id);
  if (lead.quote_id) return lead.quote_id;
  let customerId = lead.customer_id;
  if (!customerId) {
    const r = await createCustomer(
      ctx,
      { type: "particulier", last_name: lead.name, email: lead.email, phone: lead.phone, billing_city: lead.city, notes: lead.description },
      { allowDuplicate: true },
    );
    customerId = r.id;
  }
  const firstLine = lead.description.split(/[.\n]/)[0].trim().slice(0, 120);
  const quoteId = await createQuote(ctx, { customerId, title: firstLine, description: lead.description });
  await ctx.db.query("UPDATE leads SET customer_id=$3, quote_id=$4, status='devis', updated_at=now() WHERE id=$1 AND org_id=$2", [
    id,
    ctx.orgId,
    customerId,
    quoteId,
  ]);
  return quoteId;
}

/** Demandes dont la prochaine action est due (aujourd'hui ou en retard). */
export async function leadsDue(ctx: Ctx): Promise<number> {
  const r = await one<{ n: unknown }>(
    ctx.db,
    "SELECT count(*) AS n FROM leads WHERE org_id=$1 AND status = ANY($2) AND next_action_on <= current_date",
    [ctx.orgId, OPEN_LEAD_STATUSES],
  );
  return Number(r?.n ?? 0);
}
