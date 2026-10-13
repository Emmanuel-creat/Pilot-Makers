/**
 * Devis : brouillons, émission de versions figées, envoi, acceptation (modules E, F, I).
 */

import { randomUUID } from "node:crypto";
import { type Measure, sanitizeMeasure } from "@/lib/calc/measure";
import { z } from "zod";
import type { Queryable } from "@/lib/db";
import { num, numOrNull, one } from "@/lib/db";
import { computeQuote, type CalcResult } from "@/lib/calc/engine";
import { formatEuros } from "@/lib/calc/format";
import { draftToCalcInput } from "@/lib/calc/draft";
import { badRequest, conflict, forbidden, HttpError, isUuid, notFound } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { renderQuotePdf, pdfTotals } from "@/lib/pdf/quote-pdf";
import { canonicalJson, randomToken, sha256 } from "@/lib/security";
import { assertCanIssue } from "./billing";
import { incrementUsage } from "./catalog";
import { measureProposals } from "./assistant-habits";
import { retentionBp } from "./btp";
import { acceptedCalc, snapshotOptions, validChoice } from "./options";
import { REFUSAL_CODES, REFUSAL_REASONS } from "./refusal";
import { consumerTerms, isContractPlace, reducedVatAttestation } from "./consumer";
import { buildMentions, checkCompliance, COMPLIANCE_RULES_VERSION, type ComplianceIssue } from "./compliance";
import type { Ctx } from "./context";
import { audit, logError, recordUsage, requireWritable } from "./context";
import { customerDisplayName, type Customer } from "./customers";
import { appUrl, renderTemplate, sendMail } from "./mail";
import { revealBank, type Organization } from "./organization";
import {
  EDITABLE_STATUSES,
  PENDING_STATUSES,
  type DraftLine,
  type DraftSection,
  type PdfLayout,
  type PriceRevision,
  type QuoteDraft,
  type QuoteSnapshot,
  type QuoteStatus,
} from "./quote-types";
import { normalizeRevision, revisionMention } from "./revision";
import { snapshotMedia, type SnapshotMedia } from "./quote-media";
import { aidIssues, aidMentions, energyAidSchema, normalizeAid, rgeQualifications, type EnergyAid, type RgeQualification } from "./aids";
import { enqueueWebhook } from "./webhooks";

const DAY = 86_400_000;

/* ------------------------------------------------------------------ */
/* Validation des brouillons                                           */
/* ------------------------------------------------------------------ */

const str = (max: number) => z.string().max(max).optional().default("");

const lineSchema = z.object({
  id: z.string().refine(isUuid, "Identifiant de ligne invalide"),
  kind: z.enum(["item", "pending", "note"]),
  catalogItemId: z.string().refine(isUuid).nullable().optional().default(null),
  nature: z.enum(["materiau", "main_oeuvre", "deplacement", "sous_traitance", "forfait", "autre"]).default("autre"),
  label: str(500),
  description: str(4000),
  quantity: str(30),
  unit: str(20),
  unitPrice: str(30),
  unitCost: str(30),
  discountPercent: str(10),
  vatPercent: str(10),
  estimated: z.boolean().default(false),
  estimateNote: str(500),
  internalNote: str(1000),
  wastePercent: str(10).optional(),
  optional: z.boolean().optional(),
  measure: z.preprocess((v) => sanitizeMeasure(v) ?? undefined, z.custom<Measure>().optional()),
});

const sectionSchema = z.object({
  id: z.string().refine(isUuid, "Identifiant de section invalide"),
  group: z.string().trim().max(80).optional(),
  title: str(200),
  description: str(2000),
  lines: z.array(lineSchema).max(500),
});

export const draftSchema = z.object({
  customerId: z.string().refine(isUuid).nullable().optional().default(null),
  title: str(300),
  description: str(8000),
  site: z
    .object({ line1: str(300), line2: str(300), postalCode: str(10), city: str(120) })
    .default({ line1: "", line2: "", postalCode: "", city: "" }),
  validityDays: z.coerce.number().int().min(1).max(365).default(30),
  paymentTerms: str(2000),
  specialConditions: str(4000),
  depositPercent: str(10),
  estimatedDuration: str(120),
  estimatedStart: str(120),
  globalDiscount: str(10),
  template: str(20),
  layout: z.enum(["detaille", "synthese", "lots"]).default("detaille"),
  internalNotes: str(4000),
  contractPlace: z.enum(["auto", "hors_etablissement", "etablissement"]).default("auto"),
  reverseCharge: z.boolean().default(false),
  retentionPercent: str(10).refine((v) => retentionBp(v) !== null, "Retenue de garantie : 5 % au plus"),
  priceRevision: z.object({ index: str(10), baseMonth: str(7), fixedPercent: str(10) }).nullable().optional().default(null),
  energyAid: energyAidSchema,
  sections: z.array(sectionSchema).max(50),
});

export type DraftInput = z.input<typeof draftSchema>;

/** TVA non facturée : franchise en base de l'entreprise, ou autoliquidation en sous-traitance. */
export function quoteVatExempt(org: Pick<Organization, "vat_regime">, d: { reverseCharge?: boolean }): boolean {
  return org.vat_regime === "franchise" || d.reverseCharge === true;
}

/* ------------------------------------------------------------------ */
/* Lecture                                                             */
/* ------------------------------------------------------------------ */

function iso(d: unknown): string {
  return d instanceof Date ? d.toISOString() : d ? String(d) : "";
}

async function loadSections(q: Queryable, quoteId: string, orgId: string): Promise<DraftSection[]> {
  const secs = await q.query<{ id: string; grp: string; title: string; description: string }>(
    "SELECT id, grp, title, description FROM quote_sections WHERE quote_id=$1 AND org_id=$2 ORDER BY position",
    [quoteId, orgId],
  );
  const lines = await q.query<Record<string, unknown>>("SELECT * FROM quote_lines WHERE quote_id=$1 AND org_id=$2 ORDER BY position", [
    quoteId,
    orgId,
  ]);
  return secs.map((s) => ({
    id: s.id,
    ...(s.grp ? { group: s.grp } : {}),
    title: s.title,
    description: s.description,
    lines: lines
      .filter((l) => l.section_id === s.id)
      .map(
        (l): DraftLine => ({
          id: String(l.id),
          kind: l.kind as DraftLine["kind"],
          catalogItemId: (l.catalog_item_id as string | null) ?? null,
          nature: l.nature as DraftLine["nature"],
          label: String(l.label),
          description: String(l.description),
          quantity: String(l.quantity),
          unit: String(l.unit),
          unitPrice: String(l.unit_price),
          unitCost: String(l.unit_cost),
          discountPercent: String(l.discount_percent),
          vatPercent: String(l.vat_percent),
          estimated: Boolean(l.estimated),
          estimateNote: String(l.estimate_note),
          internalNote: String(l.internal_note ?? ""),
          ...(l.waste_percent ? { wastePercent: String(l.waste_percent) } : {}),
          ...(l.optional === true ? { optional: true } : {}),
          ...(l.measure && sanitizeMeasure(l.measure) ? { measure: sanitizeMeasure(l.measure)! } : {}),
        }),
      ),
  }));
}

export async function getQuoteRow(q: Queryable, ctx: Pick<Ctx, "orgId">, id: string) {
  if (!isUuid(id)) throw notFound("Devis introuvable");
  const r = await one<Record<string, unknown>>(
    q,
    `SELECT q.*, u.name AS author_name, p.number AS parent_number, p.responded_at AS parent_responded_at
     FROM quotes q LEFT JOIN users u ON u.id=q.author_id LEFT JOIN quotes p ON p.id=q.amends_quote_id AND p.org_id=q.org_id
     WHERE q.id=$1 AND q.org_id=$2`,
    [id, ctx.orgId],
  );
  if (!r) throw notFound("Devis introuvable");
  return r;
}

export async function getDraft(ctx: Ctx, id: string, q: Queryable = ctx.db): Promise<QuoteDraft> {
  const r = await getQuoteRow(q, ctx, id);
  return {
    id: String(r.id),
    number: (r.number as string | null) ?? null,
    status: r.status as QuoteStatus,
    customerId: (r.customer_id as string | null) ?? null,
    title: String(r.title),
    description: String(r.description),
    site: {
      line1: String(r.site_line1),
      line2: String(r.site_line2),
      postalCode: String(r.site_postal_code),
      city: String(r.site_city),
    },
    validityDays: num(r.validity_days),
    paymentTerms: String(r.payment_terms),
    specialConditions: String(r.special_conditions),
    depositPercent: String(r.deposit_percent),
    estimatedDuration: String(r.estimated_duration),
    estimatedStart: String(r.estimated_start),
    globalDiscount: String(r.global_discount),
    template: String(r.template),
    layout: (["detaille", "synthese", "lots"].includes(String(r.pdf_layout)) ? r.pdf_layout : "detaille") as PdfLayout,
    internalNotes: String(r.internal_notes),
    contractPlace: isContractPlace(r.contract_place) ? r.contract_place : ("auto" as const),
    reverseCharge: r.reverse_charge === true,
    retentionPercent: String(r.retention_percent ?? ""),
    priceRevision: (r.price_revision as PriceRevision | null) ?? null,
    energyAid: (r.energy_aid as EnergyAid | null) ?? null,
    ...(r.amends_quote_id
      ? {
          amendment: {
            parentId: String(r.amends_quote_id),
            index: num(r.amendment_index),
            parentNumber: String(r.parent_number ?? ""),
            parentAcceptedOn: r.parent_responded_at ? parisDate(new Date(r.parent_responded_at as string | Date)) : "",
          },
        }
      : {}),
    sections: await loadSections(q, id, ctx.orgId),
    draftRevision: num(r.draft_revision),
    currentVersion: num(r.current_version),
    acceptedVersion: numOrNull(r.accepted_version),
    authorName: String(r.author_name ?? ""),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
}

export { draftToCalcInput };

export interface QuoteListFilters {
  status?: string;
  customerId?: string;
  q?: string;
  from?: string;
  to?: string;
  minTtc?: number;
  maxTtc?: number;
  archived?: boolean;
  sort?: "updated" | "created" | "number" | "amount" | "customer";
  dir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export async function listQuotes(ctx: Ctx, f: QuoteListFilters = {}) {
  await expireQuotes(ctx.db, ctx.orgId);
  const params: unknown[] = [ctx.orgId];
  const where = ["q.org_id=$1", f.archived ? "q.archived_at IS NOT NULL" : "q.archived_at IS NULL"];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (f.status === "pending") where.push(`q.status IN ('ready','sent','viewed')`);
  else if (f.status === "drafts") where.push(`q.status IN ('draft','incomplete')`);
  else if (f.status) where.push(`q.status = ${add(f.status)}`);
  if (f.customerId && isUuid(f.customerId)) where.push(`q.customer_id = ${add(f.customerId)}`);
  if (f.q?.trim()) {
    const p = add(`%${f.q.trim().toLowerCase()}%`);
    where.push(
      `(lower(coalesce(q.number,'')) LIKE ${p} OR lower(q.title) LIKE ${p} OR lower(coalesce(c.company_name,'') || ' ' || coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) LIKE ${p})`,
    );
  }
  if (f.from) where.push(`q.created_at >= ${add(f.from)}`);
  if (f.to) where.push(`q.created_at < (${add(f.to)}::date + 1)`);
  if (f.minTtc !== undefined && Number.isFinite(f.minTtc)) where.push(`q.total_ttc_cents >= ${add(Math.round(f.minTtc * 100))}`);
  if (f.maxTtc !== undefined && Number.isFinite(f.maxTtc)) where.push(`q.total_ttc_cents <= ${add(Math.round(f.maxTtc * 100))}`);
  const sortCol = {
    updated: "q.updated_at",
    created: "q.created_at",
    number: "q.number",
    amount: "q.total_ttc_cents",
    customer: "coalesce(nullif(c.company_name,''), c.last_name)",
  }[f.sort ?? "updated"];
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
  const page = Math.max(f.page ?? 1, 1);
  const count = await one<{ n: unknown }>(
    ctx.db,
    `SELECT count(*) AS n FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id WHERE ${where.join(" AND ")}`,
    params,
  );
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT q.id, q.number, q.status, q.title, q.total_ht_cents, q.total_ttc_cents, q.margin_cents, q.created_at, q.updated_at,
            q.issued_at, q.valid_until, q.current_version, q.customer_id,
            c.type AS c_type, c.company_name, c.first_name, c.last_name, c.civility
     FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id
     WHERE ${where.join(" AND ")} ORDER BY ${sortCol} ${dir} NULLS LAST, q.id
     LIMIT ${add(pageSize)} OFFSET ${add((page - 1) * pageSize)}`,
    params,
  );
  return {
    total: num(count?.n),
    page,
    pageSize,
    items: rows.map((r) => ({
      id: String(r.id),
      number: (r.number as string | null) ?? null,
      status: r.status as QuoteStatus,
      title: String(r.title),
      customerId: (r.customer_id as string | null) ?? null,
      customerName: r.customer_id
        ? customerDisplayName({
            type: r.c_type as Customer["type"],
            company_name: String(r.company_name ?? ""),
            first_name: String(r.first_name ?? ""),
            last_name: String(r.last_name ?? ""),
            civility: String(r.civility ?? ""),
          })
        : "",
      totalHtCents: num(r.total_ht_cents),
      totalTtcCents: num(r.total_ttc_cents),
      marginCents: num(r.margin_cents),
      createdAt: iso(r.created_at),
      updatedAt: iso(r.updated_at),
      issuedAt: r.issued_at ? iso(r.issued_at) : null,
      validUntil: r.valid_until ? iso(r.valid_until).slice(0, 10) : null,
      currentVersion: num(r.current_version),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* Création et modification                                            */
/* ------------------------------------------------------------------ */

export async function orgRow(q: Queryable, orgId: string): Promise<Organization> {
  return revealBank((await one<Record<string, unknown>>(q, "SELECT * FROM organizations WHERE id=$1", [orgId]))!) as unknown as Organization;
}

export function emptySection(title = ""): DraftSection {
  return { id: randomUUID(), title, description: "", lines: [] };
}

export async function createQuote(ctx: Ctx, init: { customerId?: string | null; title?: string; description?: string } = {}) {
  requireWritable(ctx);
  const org = await orgRow(ctx.db, ctx.orgId);
  let site = { line1: "", line2: "", postalCode: "", city: "" };
  if (init.customerId) {
    const c = await one<Customer>(ctx.db, "SELECT * FROM customers WHERE id=$1 AND org_id=$2", [init.customerId, ctx.orgId]);
    if (!c) throw notFound("Client introuvable");
    site = customerSite(c);
  }
  return ctx.db.transaction(async (tx) => {
    const row = await one<{ id: string }>(
      tx,
      `INSERT INTO quotes (org_id, customer_id, author_id, title, description, site_line1, site_line2, site_postal_code, site_city,
         validity_days, payment_terms, deposit_percent, template, pdf_layout)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
      [
        ctx.orgId,
        init.customerId ?? null,
        ctx.userId,
        init.title ?? "",
        init.description ?? "",
        site.line1,
        site.line2,
        site.postalCode,
        site.city,
        num(org.default_validity_days) || 30,
        org.payment_terms,
        org.default_deposit_percent,
        org.quote_template,
        ["detaille", "synthese", "lots"].includes(org.default_pdf_layout) ? org.default_pdf_layout : "detaille",
      ],
    );
    const id = row!.id;
    await tx.query("INSERT INTO quote_sections (id, quote_id, org_id, position, title) VALUES ($1,$2,$3,0,'')", [randomUUID(), id, ctx.orgId]);
    await addEvent(tx, ctx, id, null, "created");
    return id;
  });
}

export function customerSite(c: Customer) {
  return c.site_same_as_billing
    ? { line1: c.billing_line1, line2: c.billing_line2, postalCode: c.billing_postal_code, city: c.billing_city }
    : { line1: c.site_line1, line2: c.site_line2, postalCode: c.site_postal_code, city: c.site_city };
}

async function writeSections(tx: Queryable, quoteId: string, orgId: string, sections: z.infer<typeof sectionSchema>[]) {
  await tx.query("DELETE FROM quote_lines WHERE quote_id=$1 AND org_id=$2", [quoteId, orgId]);
  await tx.query("DELETE FROM quote_sections WHERE quote_id=$1 AND org_id=$2", [quoteId, orgId]);
  const seen = new Set<string>();
  let sp = 0;
  for (const s of sections) {
    if (seen.has(s.id)) throw badRequest("Identifiant de section en double");
    seen.add(s.id);
    await tx.query("INSERT INTO quote_sections (id, quote_id, org_id, position, title, description, grp) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
      s.id,
      quoteId,
      orgId,
      sp++,
      s.title,
      s.description,
      s.group ?? "",
    ]);
    let lp = 0;
    for (const l of s.lines) {
      if (seen.has(l.id)) throw badRequest("Identifiant de ligne en double");
      seen.add(l.id);
      await tx.query(
        `INSERT INTO quote_lines (id, section_id, quote_id, org_id, position, kind, catalog_item_id, nature, label, description,
           quantity, unit, unit_price, unit_cost, discount_percent, vat_percent, estimated, estimate_note, internal_note, optional, waste_percent, measure)
         VALUES ($1,$2,$3,$4,$5,$6,
           (SELECT id FROM catalog_items WHERE id=$7::uuid AND org_id=$4),
           $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          l.id,
          s.id,
          quoteId,
          orgId,
          lp++,
          l.kind,
          l.catalogItemId,
          l.nature,
          l.label,
          l.description,
          l.quantity,
          l.unit,
          l.unitPrice,
          l.unitCost,
          l.discountPercent,
          l.vatPercent,
          l.estimated,
          l.estimateNote,
          l.internalNote ?? "",
          l.kind === "item" && l.optional === true,
          l.wastePercent ?? "",
          l.kind === "item" && l.measure ? JSON.stringify(l.measure) : null,
        ],
      );
    }
  }
}

/**
 * Enregistre un brouillon. La révision attendue protège contre l'écrasement
 * silencieux d'une modification faite ailleurs (autre onglet, autre appareil).
 */
export async function saveDraft(ctx: Ctx, id: string, raw: unknown, expectedRevision: number) {
  requireWritable(ctx);
  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, parsed.error.issues);
  const d = parsed.data;
  const org = await orgRow(ctx.db, ctx.orgId);
  return ctx.db.transaction(async (tx) => {
    const r = await one<{ status: QuoteStatus; draft_revision: unknown }>(
      tx,
      "SELECT status, draft_revision FROM quotes WHERE id=$1 AND org_id=$2 FOR UPDATE",
      [id, ctx.orgId],
    );
    if (!r) throw notFound("Devis introuvable");
    if (!EDITABLE_STATUSES.includes(r.status)) {
      throw conflict("Ce devis a été émis : créez une nouvelle version pour le modifier");
    }
    if (num(r.draft_revision) !== expectedRevision) {
      throw new HttpError(409, "revision_conflict", "Ce devis a été modifié ailleurs. Rechargez-le pour ne rien perdre.", {
        currentRevision: num(r.draft_revision),
      });
    }
    if (d.customerId) {
      const c = await one(tx, "SELECT 1 FROM customers WHERE id=$1 AND org_id=$2", [d.customerId, ctx.orgId]);
      if (!c) throw notFound("Client introuvable");
    }
    const calc = computeQuote(draftToCalcInput({ sections: d.sections, globalDiscount: d.globalDiscount }, quoteVatExempt(org, d)));
    const status: QuoteStatus = calc.ok ? "draft" : "incomplete";
    const revision = normalizeRevision(d.priceRevision);
    await writeSections(tx, id, ctx.orgId, d.sections);
    const aid = normalizeAid(d.energyAid);
    await tx.query("UPDATE quotes SET price_revision=$3, energy_aid=$4 WHERE id=$1 AND org_id=$2", [
      id,
      ctx.orgId,
      revision ? JSON.stringify(revision) : null,
      aid ? JSON.stringify(aid) : null,
    ]);
    await tx.query(
      `UPDATE quotes SET customer_id=$3, title=$4, description=$5, site_line1=$6, site_line2=$7, site_postal_code=$8, site_city=$9,
         validity_days=$10, payment_terms=$11, special_conditions=$12, deposit_percent=$13, estimated_duration=$14,
         estimated_start=$15, global_discount=$16, template=$17, internal_notes=$18, status=$19,
         total_ht_cents=$20, total_ttc_cents=$21, margin_cents=$22, contract_place=$23, reverse_charge=$24, retention_percent=$25, pdf_layout=$26, draft_revision=draft_revision+1, updated_at=now()
       WHERE id=$1 AND org_id=$2`,
      [
        id,
        ctx.orgId,
        d.customerId,
        d.title,
        d.description,
        d.site.line1,
        d.site.line2,
        d.site.postalCode,
        d.site.city,
        d.validityDays,
        d.paymentTerms,
        d.specialConditions,
        d.depositPercent,
        d.estimatedDuration,
        d.estimatedStart,
        d.globalDiscount,
        d.template,
        d.internalNotes,
        status,
        calc.totalHtCents,
        calc.totalTtcCents,
        calc.margin.marginCents,
        d.contractPlace,
        d.reverseCharge,
        d.retentionPercent,
        d.layout,
      ],
    );
    if (d.customerId) await tx.query("UPDATE customers SET last_activity_at=now() WHERE id=$1 AND org_id=$2", [d.customerId, ctx.orgId]);
    return { draftRevision: expectedRevision + 1, status, calc };
  });
}

/** Aperçu des calculs et contrôles, sans rien enregistrer. */
export async function previewQuote(ctx: Ctx, id: string, raw?: unknown) {
  const draft = await getDraft(ctx, id);
  const d = raw ? draftSchema.parse(raw) : draft;
  const org = await orgRow(ctx.db, ctx.orgId);
  const calc = computeQuote(draftToCalcInput(d, quoteVatExempt(org, d)));
  const customer = d.customerId ? await one<Customer>(ctx.db, "SELECT * FROM customers WHERE id=$1 AND org_id=$2", [d.customerId, ctx.orgId]) : null;
  const issues = checkCompliance(complianceInput(org, customer, d, calc));
  const today = parisDate(new Date());
  issues.push(
    ...aidIssues(normalizeAid(d.energyAid), await rgeQualifications(ctx.db, ctx.orgId), today, parisDate(addDays(new Date(), d.validityDays)), calc.totalTtcCents),
  );
  return { calc, issues, canIssue: !issues.some((i) => i.blocking) };
}

function complianceInput(
  org: Organization,
  customer: Customer | null,
  d: Pick<
    QuoteDraft,
    | "title"
    | "description"
    | "site"
    | "validityDays"
    | "paymentTerms"
    | "sections"
    | "depositPercent"
    | "contractPlace"
    | "reverseCharge"
    | "retentionPercent"
  >,
  calc: CalcResult,
) {
  return {
    org,
    customer: customer
      ? {
          type: customer.type,
          name: customerDisplayName(customer),
          billing_line1: customer.billing_line1,
          billing_postal_code: customer.billing_postal_code,
          billing_city: customer.billing_city,
          siren: customer.siren,
          vat_number: customer.vat_number,
        }
      : null,
    quote: {
      title: d.title,
      description: d.description,
      site_line1: d.site.line1,
      site_postal_code: d.site.postalCode,
      site_city: d.site.city,
      validity_days: d.validityDays,
      payment_terms: d.paymentTerms,
      deposit_percent: d.depositPercent,
      contract_place: d.contractPlace,
      reverse_charge: d.reverseCharge,
      retention_percent: d.retentionPercent,
    },
    lines: d.sections.flatMap((s) =>
      s.lines.map((l) => ({ kind: l.kind, nature: l.nature, label: l.label, estimated: l.estimated, vat_percent: l.vatPercent })),
    ),
    calc,
  };
}

/* ------------------------------------------------------------------ */
/* Émission                                                            */
/* ------------------------------------------------------------------ */

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY);
}

export function parisDate(d: Date): string {
  // Date civile à Paris (AAAA-MM-JJ), indépendante du fuseau du serveur.
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function frDate(isoDate: string) {
  const [y, m, d] = isoDate.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Vérifie qu'un snapshot est cohérent : les totaux enregistrés sont ceux que le moteur recalcule. */
export function verifySnapshot(s: QuoteSnapshot): { ok: boolean; reason?: string } {
  const re = computeQuote(draftToCalcInput({ sections: s.sections, globalDiscount: s.quote.globalDiscount }, quoteVatExempt(s.org, s.quote)));
  if (canonicalJson(re) !== canonicalJson(s.calc)) return { ok: false, reason: "Les totaux enregistrés ne correspondent pas au recalcul" };
  const t = pdfTotals(s);
  if (t.totalTtc !== formatEuros(re.totalTtcCents) || t.totalHt !== formatEuros(re.totalHtCents)) {
    return { ok: false, reason: "Les totaux du PDF ne correspondent pas aux données" };
  }
  return { ok: true };
}

export function amendmentMention(a: { index: number; parentNumber: string; parentAcceptedOn: string }) {
  return (
    `Avenant n° ${a.index} au devis n° ${a.parentNumber}${a.parentAcceptedOn ? ` accepté le ${frDate(a.parentAcceptedOn)}` : ""}. ` +
    "Il porte sur des travaux supplémentaires ou modifiés ; les conditions du devis initial qu'il ne modifie pas restent applicables."
  );
}

/** Construit la photographie figée d'un devis (utilisée à l'émission et pour l'aperçu). */
export function buildSnapshot(args: {
  ctx: Ctx;
  d: QuoteDraft;
  org: Organization;
  customer: Customer;
  calc: CalcResult;
  issues: ComplianceIssue[];
  number: string;
  version: number;
  now?: Date;
  /** Qualifications RGE de l'entreprise, citées quand le devis vise des aides à la rénovation */
  rge?: RgeQualification[];
  /** Photos et croquis joints au devis */
  media?: SnapshotMedia[];
}): QuoteSnapshot {
  const { ctx, d, org, customer, calc, issues, number, version } = args;
  const aid = normalizeAid(d.energyAid);
  const now = args.now ?? new Date();
  const issueDate = parisDate(now);
  const validUntil = parisDate(addDays(now, d.validityDays));
  const site = d.site;
  const snapshot: QuoteSnapshot = {
    schema: 1,
    rulesVersion: COMPLIANCE_RULES_VERSION,
    number,
    version,
    issuedAt: now.toISOString(),
    issueDate,
    validUntil,
    author: d.authorName || ctx.userName,
    template: d.template || org.quote_template,
    ...(d.layout && d.layout !== "detaille" ? { layout: d.layout } : {}),
    accentColor: org.accent_color,
    ...(org.pdf_font === "times" ? { font: "times" as const } : {}),
    ...(org.pdf_footer_note?.trim() ? { footerNote: org.pdf_footer_note.trim() } : {}),
    ...(args.media?.length ? { media: args.media } : {}),
    watermark: Boolean(ctx.entitlements.plan.features.watermark),
    org: {
      trade_name: org.trade_name,
      legal_name: org.legal_name,
      legal_form: org.legal_form,
      share_capital: org.share_capital,
      rcs_rm: org.rcs_rm,
      address_line1: org.address_line1,
      address_line2: org.address_line2,
      postal_code: org.postal_code,
      city: org.city,
      country: org.country,
      siren: org.siren,
      siret: org.siret,
      vat_number: org.vat_number,
      phone: org.phone,
      email: org.email,
      website: org.website,
      logo_data: org.logo_data,
      signature_data: org.signature_data,
      vat_regime: org.vat_regime,
      general_conditions: org.general_conditions,
    },
    customer: {
      id: customer.id,
      type: customer.type,
      name: customerDisplayName(customer),
      contact: customer.type !== "particulier" ? [customer.civility, customer.first_name, customer.last_name].filter(Boolean).join(" ") : "",
      billing_line1: customer.billing_line1,
      billing_line2: customer.billing_line2,
      billing_postal_code: customer.billing_postal_code,
      billing_city: customer.billing_city,
      billing_country: customer.billing_country,
      email: customer.email,
      phone: customer.phone,
      siren: customer.siren,
      vat_number: customer.vat_number,
    },
    quote: {
      title: d.title,
      description: d.description,
      site,
      paymentTerms: d.paymentTerms,
      specialConditions: d.specialConditions,
      depositPercent: d.depositPercent,
      estimatedDuration: d.estimatedDuration,
      estimatedStart: d.estimatedStart,
      globalDiscount: d.globalDiscount,
      reverseCharge: d.reverseCharge,
      retentionPercent: d.retentionPercent,
      ...(d.amendment
        ? { amendment: { index: d.amendment.index, parentNumber: d.amendment.parentNumber, parentAcceptedOn: d.amendment.parentAcceptedOn } }
        : {}),
      ...(d.priceRevision ? { priceRevision: d.priceRevision } : {}),
      ...(aid ? { energyAid: aid } : {}),
    },
    // Les commentaires internes ne quittent jamais l'entreprise : ils ne sont pas figés dans la version envoyée.
    sections: d.sections.map((sec) => ({ ...sec, lines: sec.lines.map(({ internalNote: _internal, wastePercent: _waste, measure: _measure, ...l }) => l) })),
    calc,
    mentions: [
      ...(d.amendment ? [amendmentMention(d.amendment)] : []),
      ...buildMentions({
        org,
        customer: { type: customer.type, name: "", billing_line1: "", billing_postal_code: "", billing_city: "", siren: "" },
        validUntil: frDate(validUntil),
        depositPercent: d.depositPercent,
        reverseCharge: d.reverseCharge,
        retentionPercent: d.retentionPercent,
      }),
      ...(d.priceRevision ? [revisionMention(d.priceRevision)] : []),
      ...aidMentions(aid, args.rge ?? [], issueDate, calc.totalTtcCents),
    ],
    warnings: issues.filter((i) => !i.blocking).map((i) => i.message),
    consumer: consumerTerms(d.contractPlace, customer.type, calc, org.vat_regime),
  };
  return snapshot;
}

export async function issueQuote(ctx: Ctx, id: string, expectedRevision?: number) {
  requireWritable(ctx);
  try {
    return await issueInTransaction(ctx, id, expectedRevision);
  } catch (e) {
    // Journalisé hors transaction pour ne pas être annulé avec elle.
    if (e instanceof HttpError && (e.code === "pdf_failed" || e.code === "integrity")) {
      await logError(ctx.db, e.code === "pdf_failed" ? "pdf.render" : "quote.integrity", String(e.details ?? e.message), ctx.orgId, { quoteId: id });
    }
    throw e;
  }
}

async function issueInTransaction(ctx: Ctx, id: string, expectedRevision?: number) {
  return ctx.db.transaction(async (tx) => {
    const row = await one<{ status: QuoteStatus; draft_revision: unknown; current_version: unknown; number: string | null }>(
      tx,
      "SELECT status, draft_revision, current_version, number FROM quotes WHERE id=$1 AND org_id=$2 FOR UPDATE",
      [id, ctx.orgId],
    );
    if (!row) throw notFound("Devis introuvable");
    if (!EDITABLE_STATUSES.includes(row.status)) throw conflict("Ce devis est déjà émis");
    if (expectedRevision !== undefined && num(row.draft_revision) !== expectedRevision) {
      throw new HttpError(409, "revision_conflict", "Ce devis a été modifié ailleurs. Rechargez-le avant d'émettre.");
    }
    const d = await getDraft(ctx, id, tx);
    const org = await orgRow(tx, ctx.orgId);
    const customer = d.customerId ? await one<Customer>(tx, "SELECT * FROM customers WHERE id=$1 AND org_id=$2", [d.customerId, ctx.orgId]) : null;
    // Recalcul côté serveur : les totaux envoyés par le navigateur ne sont jamais utilisés.
    const calc = computeQuote(draftToCalcInput(d, quoteVatExempt(org, d)));
    const issues = checkCompliance(complianceInput(org, customer, d, calc));
    const rge = await rgeQualifications(tx, ctx.orgId);
    issues.push(
      ...aidIssues(normalizeAid(d.energyAid), rge, parisDate(new Date()), parisDate(addDays(new Date(), d.validityDays)), calc.totalTtcCents),
    );
    const blocking = issues.filter((i) => i.blocking);
    if (blocking.length || !customer) {
      throw new HttpError(422, "not_issuable", "Le devis ne peut pas être émis : " + blocking.map((b) => b.message).join(" ; "), { issues });
    }
    const version = num(row.current_version) + 1;
    if (version === 1) await assertCanIssue(tx, ctx);

    let number = row.number;
    if (!number) {
      const seqRow = await one<{ seq: unknown; prefix: string }>(
        tx,
        "UPDATE organizations SET next_quote_seq = next_quote_seq + 1 WHERE id=$1 RETURNING next_quote_seq - 1 AS seq, quote_prefix AS prefix",
        [ctx.orgId],
      );
      const year = parisDate(new Date()).slice(0, 4);
      number = `${seqRow!.prefix || "D"}-${year}-${String(num(seqRow!.seq)).padStart(4, "0")}`;
    }

    const now = new Date();
    const media = await snapshotMedia(tx, ctx.orgId, id);
    const snapshot = buildSnapshot({ ctx, d, org, customer, calc, issues, number, version, now, rge, media });
    const validUntil = snapshot.validUntil;
    const check = verifySnapshot(snapshot);
    if (!check.ok) throw new HttpError(500, "integrity", "Contrôle de cohérence échoué : " + check.reason, check.reason);
    let pdf: Uint8Array;
    try {
      pdf = await renderQuotePdf(snapshot);
    } catch (e) {
      throw new HttpError(500, "pdf_failed", "La génération du PDF a échoué. L'incident a été signalé.", (e as Error).message);
    }
    const pdfHash = sha256(pdf);
    const snapHash = sha256(canonicalJson(snapshot));
    await tx.query(
      `INSERT INTO quote_versions (quote_id, org_id, version, number, snapshot, pdf, pdf_sha256, snapshot_sha256, total_ht_cents, total_ttc_cents, issued_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [id, ctx.orgId, version, number, JSON.stringify(snapshot), pdf, pdfHash, snapHash, calc.totalHtCents, calc.totalTtcCents, ctx.userId],
    );
    await tx.query(
      `UPDATE quotes SET status='ready', number=$3, current_version=$4, issued_at=$5, valid_until=$6, total_ht_cents=$7,
         total_ttc_cents=$8, margin_cents=$9, updated_at=now() WHERE id=$1 AND org_id=$2`,
      [id, ctx.orgId, number, version, now, validUntil, calc.totalHtCents, calc.totalTtcCents, calc.margin.marginCents],
    );
    if (version > 1) {
      // Les liens de la version précédente ne permettent plus d'accepter.
      await tx.query("UPDATE share_links SET revoked_at=now() WHERE quote_id=$1 AND version < $2 AND revoked_at IS NULL", [id, version]);
      await addEvent(tx, ctx, id, version - 1, "version.superseded");
    }
    await incrementUsage(
      tx,
      ctx.orgId,
      d.sections.flatMap((s) => s.lines.map((l) => l.catalogItemId).filter((x): x is string => !!x)),
    );
    // Qualité de l'assistant : ce qui a été gardé des lignes proposées, et habitudes retenues.
    await measureProposals(tx, ctx.orgId, id, d.sections);
    await addEvent(tx, ctx, id, version, "issued", { pdf_sha256: pdfHash, snapshot_sha256: snapHash, total_ttc_cents: calc.totalTtcCents });
    await recordUsage(tx, ctx.orgId, ctx.userId, "pdf");
    return { version, number, pdfSha256: pdfHash, warnings: snapshot.warnings };
  });
}

/** PDF d'aperçu d'un brouillon, non enregistré et marqué « Aperçu ». */
export async function previewPdf(ctx: Ctx, id: string, override?: QuoteDraft): Promise<Uint8Array> {
  const d = override ?? (await getDraft(ctx, id));
  const org = await orgRow(ctx.db, ctx.orgId);
  const customer =
    (d.customerId ? await one<Customer>(ctx.db, "SELECT * FROM customers WHERE id=$1 AND org_id=$2", [d.customerId, ctx.orgId]) : null) ??
    ({
      id: "",
      type: "particulier",
      civility: "",
      first_name: "",
      last_name: "Client à choisir",
      company_name: "",
      billing_line1: "",
      billing_line2: "",
      billing_postal_code: "",
      billing_city: "",
      billing_country: "France",
      email: "",
      phone: "",
      siren: "",
      vat_number: "",
    } as unknown as Customer);
  const calc = computeQuote(draftToCalcInput(d, quoteVatExempt(org, d)));
  const snapshot = buildSnapshot({
    ctx,
    d,
    org,
    customer,
    calc,
    issues: [],
    number: d.number ?? "BROUILLON",
    version: d.currentVersion + 1,
    rge: await rgeQualifications(ctx.db, ctx.orgId),
    media: await snapshotMedia(ctx.db, ctx.orgId, id),
  });
  snapshot.preview = true;
  return renderQuotePdf(snapshot);
}

/** Aperçu de l'apparence choisie dans Entreprise, sur le dernier devis de l'entreprise. */
export async function appearancePreviewPdf(ctx: Ctx): Promise<Uint8Array> {
  const last = await one<{ id: string }>(ctx.db, "SELECT id FROM quotes WHERE org_id=$1 ORDER BY created_at DESC LIMIT 1", [ctx.orgId]);
  if (!last) throw notFound("Créez un premier devis pour voir l'aperçu de votre modèle");
  const org = await orgRow(ctx.db, ctx.orgId);
  const d = await getDraft(ctx, last.id);
  return previewPdf(ctx, last.id, { ...d, template: org.quote_template, layout: d.sections.length > 1 ? (org.default_pdf_layout as PdfLayout) : d.layout });
}

/* ------------------------------------------------------------------ */
/* Versions                                                            */
/* ------------------------------------------------------------------ */

export async function listVersions(ctx: Ctx, quoteId: string) {
  await getQuoteRow(ctx.db, ctx, quoteId);
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT v.version, v.number, v.issued_at, v.pdf_sha256, v.snapshot_sha256, v.total_ht_cents, v.total_ttc_cents, u.name AS issued_by
     FROM quote_versions v LEFT JOIN users u ON u.id=v.issued_by WHERE v.quote_id=$1 AND v.org_id=$2 ORDER BY v.version DESC`,
    [quoteId, ctx.orgId],
  );
  return rows.map((r) => ({
    version: num(r.version),
    number: String(r.number),
    issuedAt: iso(r.issued_at),
    pdfSha256: String(r.pdf_sha256),
    snapshotSha256: String(r.snapshot_sha256),
    totalHtCents: num(r.total_ht_cents),
    totalTtcCents: num(r.total_ttc_cents),
    issuedBy: String(r.issued_by ?? ""),
  }));
}

export async function getVersion(q: Queryable, orgId: string, quoteId: string, version: number) {
  const r = await one<Record<string, unknown>>(q, "SELECT * FROM quote_versions WHERE quote_id=$1 AND org_id=$2 AND version=$3", [
    quoteId,
    orgId,
    version,
  ]);
  if (!r) throw notFound("Version introuvable");
  return {
    id: String(r.id),
    version: num(r.version),
    number: String(r.number),
    snapshot: r.snapshot as QuoteSnapshot,
    pdf: r.pdf as Uint8Array,
    pdfSha256: String(r.pdf_sha256),
    issuedAt: iso(r.issued_at),
  };
}

/**
 * Exemplaire accepté : le PDF de la version acceptée, avec le nom, la date et le mode
 * d'acceptation reportés dans la zone « Bon pour accord ». Recalculé à la demande depuis
 * le snapshot figé et l'événement d'acceptation, il est donc toujours identique.
 */
export async function acceptedCopy(q: Queryable, orgId: string, quoteId: string) {
  const quote = await one<{ accepted_version: unknown; accepted_options: unknown }>(
    q,
    "SELECT accepted_version, accepted_options FROM quotes WHERE id=$1 AND org_id=$2",
    [quoteId, orgId],
  );
  const version = numOrNull(quote?.accepted_version);
  if (!version) throw conflict("Ce devis n'a pas été accepté");
  const v = await getVersion(q, orgId, quoteId, version);
  const ev = await one<{ data: Record<string, unknown>; created_at: Date }>(
    q,
    "SELECT data, created_at FROM document_events WHERE quote_id=$1 AND org_id=$2 AND version=$3 AND type='accepted' ORDER BY created_at DESC LIMIT 1",
    [quoteId, orgId, version],
  );
  if (!ev) throw notFound("Acceptation introuvable");
  const at = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })
    .format(new Date(ev.created_at))
    .replace(" ", " à ");
  const online = ev.data.via === "lien sécurisé";
  const onsite = ev.data.via === "signature sur place";
  const sig = onsite
    ? await one<{ image: Uint8Array }>(
        q,
        "SELECT image FROM quote_signatures WHERE org_id=$1 AND quote_id=$2 AND version=$3 ORDER BY created_at DESC LIMIT 1",
        [orgId, quoteId, version],
      )
    : null;
  const pdf = await renderQuotePdf(v.snapshot, undefined, {
    name: online || onsite ? String(ev.data.name) : v.snapshot.customer.name,
    at,
    via: online
      ? "en ligne, par le lien sécurisé transmis au client"
      : onsite
        ? "signé à la main sur l'écran de l'entreprise, en présence du client"
        : `enregistré par l'entreprise : ${String(ev.data.proof ?? "")}`.slice(0, 200),
    documentSha256: v.pdfSha256,
    options: acceptanceOptionsText(v.snapshot, (quote?.accepted_options as string[] | null) ?? []),
    ...(sig ? { signaturePng: `data:image/png;base64,${Buffer.from(sig.image).toString("base64")}` } : {}),
  });
  return { pdf, number: v.number, version: v.version };
}

/** Ligne « options retenues » de l'exemplaire accepté, absente si le devis ne proposait pas d'option. */
function acceptanceOptionsText(s: QuoteSnapshot, chosen: string[]): string | undefined {
  if (!s.calc.options) return undefined;
  const labels = snapshotOptions(s)
    .filter((o) => chosen.includes(o.id))
    .map((o) => o.label);
  const total = acceptedCalc(s, chosen).totalTtcCents;
  return `${labels.length ? "Options retenues : " + labels.join(", ") : "Aucune option retenue"}. Montant accepté : ${formatEuros(total)} TTC.`;
}

/** Contrôle d'intégrité d'une version conservée : empreintes et totaux. */
export async function verifyVersion(ctx: Ctx, quoteId: string, version: number) {
  const v = await getVersion(ctx.db, ctx.orgId, quoteId, version);
  const pdfOk = sha256(v.pdf) === v.pdfSha256;
  const consistency = verifySnapshot(v.snapshot);
  return { pdfOk, snapshotOk: consistency.ok, reason: consistency.reason ?? null };
}

/** Repasse un devis émis en brouillon pour préparer la version suivante. */
export async function createRevision(ctx: Ctx, quoteId: string) {
  requireWritable(ctx);
  return ctx.db.transaction(async (tx) => {
    const r = await one<{ status: QuoteStatus; current_version: unknown }>(
      tx,
      "SELECT status, current_version FROM quotes WHERE id=$1 AND org_id=$2 FOR UPDATE",
      [quoteId, ctx.orgId],
    );
    if (!r) throw notFound("Devis introuvable");
    if (r.status === "accepted") {
      throw conflict("Un devis accepté ne peut pas être modifié. Dupliquez-le pour établir un avenant ou un nouveau devis.");
    }
    if (r.status === "canceled" || r.status === "superseded") throw conflict("Ce devis est clos");
    if (EDITABLE_STATUSES.includes(r.status)) return { status: r.status };
    await tx.query("UPDATE quotes SET status='draft', draft_revision=draft_revision+1, updated_at=now() WHERE id=$1 AND org_id=$2", [
      quoteId,
      ctx.orgId,
    ]);
    await addEvent(tx, ctx, quoteId, num(r.current_version), "revision.started", { from_status: r.status });
    return { status: "draft" as QuoteStatus };
  });
}

export interface VersionDiff {
  from: number;
  to: number;
  fields: { field: string; before: string; after: string }[];
  lines: { status: "added" | "removed" | "changed"; label: string; changes: string[] }[];
  totals: { before: number; after: number };
}

/** Comparaison lisible entre deux versions émises. */
export async function compareVersions(ctx: Ctx, quoteId: string, a: number, b: number): Promise<VersionDiff> {
  const va = (await getVersion(ctx.db, ctx.orgId, quoteId, a)).snapshot;
  const vb = (await getVersion(ctx.db, ctx.orgId, quoteId, b)).snapshot;
  const fields: VersionDiff["fields"] = [];
  const cmp = (field: string, x: string, y: string) => {
    if (x !== y) fields.push({ field, before: x, after: y });
  };
  cmp("Objet", va.quote.title, vb.quote.title);
  cmp("Description", va.quote.description, vb.quote.description);
  cmp("Client", va.customer.name, vb.customer.name);
  cmp("Lieu d'exécution", Object.values(va.quote.site).join(" "), Object.values(vb.quote.site).join(" "));
  cmp("Conditions de paiement", va.quote.paymentTerms, vb.quote.paymentTerms);
  cmp("Conditions particulières", va.quote.specialConditions, vb.quote.specialConditions);
  cmp("Acompte", va.quote.depositPercent, vb.quote.depositPercent);
  cmp("Remise globale", va.quote.globalDiscount, vb.quote.globalDiscount);
  cmp("Validité", frDate(va.validUntil), frDate(vb.validUntil));
  const flat = (s: QuoteSnapshot) => new Map(s.sections.flatMap((sec) => sec.lines.map((l) => [l.id, { ...l, section: sec.title }] as const)));
  const la = flat(va);
  const lb = flat(vb);
  const lines: VersionDiff["lines"] = [];
  const keys: (keyof DraftLine)[] = ["label", "description", "quantity", "unit", "unitPrice", "discountPercent", "vatPercent", "kind"];
  const names: Partial<Record<keyof DraftLine, string>> = {
    label: "libellé",
    description: "description",
    quantity: "quantité",
    unit: "unité",
    unitPrice: "prix unitaire",
    discountPercent: "remise",
    vatPercent: "TVA",
    kind: "type",
  };
  for (const [id, l] of lb) {
    const old = la.get(id);
    if (!old) {
      lines.push({ status: "added", label: l.label, changes: [] });
      continue;
    }
    const changes = keys
      .filter((k) => String(old[k]) !== String(l[k]))
      .map((k) => `${names[k]} : ${String(old[k]) || "(vide)"} devient ${String(l[k]) || "(vide)"}`);
    if (changes.length) lines.push({ status: "changed", label: l.label, changes });
  }
  for (const [id, l] of la) if (!lb.has(id)) lines.push({ status: "removed", label: l.label, changes: [] });
  return { from: a, to: b, fields, lines, totals: { before: va.calc.totalTtcCents, after: vb.calc.totalTtcCents } };
}

/* ------------------------------------------------------------------ */
/* Envoi et lien client                                                */
/* ------------------------------------------------------------------ */

export async function createShareLink(q: Queryable, orgId: string, quoteId: string, version: number, validUntil: string) {
  const token = randomToken();
  const expires = new Date(new Date(validUntil + "T23:59:59Z").getTime() + 30 * DAY);
  await q.query("INSERT INTO share_links (org_id, quote_id, version, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5)", [
    orgId,
    quoteId,
    version,
    sha256(token),
    expires,
  ]);
  return { token, url: appUrl("/d/" + token), expiresAt: expires };
}

export async function revokeShareLinks(ctx: Ctx, quoteId: string) {
  requireWritable(ctx);
  await getQuoteRow(ctx.db, ctx, quoteId);
  await ctx.db.query("UPDATE share_links SET revoked_at=now() WHERE quote_id=$1 AND org_id=$2 AND revoked_at IS NULL", [quoteId, ctx.orgId]);
  await addEvent(ctx.db, ctx, quoteId, null, "links.revoked");
}

export const sendSchema = z.object({
  to: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Adresse e-mail invalide"),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(10000),
  idempotencyKey: z.string().max(100).optional(),
});

export async function prepareSendMessage(ctx: Ctx, quoteId: string) {
  const r = await getQuoteRow(ctx.db, ctx, quoteId);
  const version = num(r.current_version);
  if (version === 0) throw conflict("Émettez le devis avant de l'envoyer");
  const v = await getVersion(ctx.db, ctx.orgId, quoteId, version);
  const org = await orgRow(ctx.db, ctx.orgId);
  const vars = templateVars(v.snapshot, org, "{lien}");
  return {
    to: v.snapshot.customer.email,
    subject: renderTemplate(org.mail_subject_template || "Votre devis {numero}", vars),
    body: renderTemplate(org.mail_body_template, vars),
  };
}

function templateVars(s: QuoteSnapshot, org: Organization, link: string): Record<string, string> {
  return {
    client: s.customer.contact || s.customer.name,
    numero: s.number,
    objet: s.quote.title,
    total_ttc: formatEuros(s.calc.totalTtcCents),
    total_ht: formatEuros(s.calc.totalHtCents),
    validite: frDate(s.validUntil),
    entreprise: org.trade_name,
    lien: link,
  };
}

export async function sendQuote(ctx: Ctx, quoteId: string, raw: unknown) {
  requireWritable(ctx);
  const parsed = sendSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  await hitRate(ctx.db, "mail.send", ctx.orgId);
  const input = parsed.data;
  return ctx.db.transaction(async (tx) => {
    const r = await one<{ status: QuoteStatus; current_version: unknown; valid_until: unknown }>(
      tx,
      "SELECT status, current_version, valid_until FROM quotes WHERE id=$1 AND org_id=$2 FOR UPDATE",
      [quoteId, ctx.orgId],
    );
    if (!r) throw notFound("Devis introuvable");
    if (!PENDING_STATUSES.includes(r.status)) {
      throw conflict(EDITABLE_STATUSES.includes(r.status) ? "Émettez le devis avant de l'envoyer" : "Ce devis ne peut plus être envoyé");
    }
    const version = num(r.current_version);
    const v = await getVersion(tx, ctx.orgId, quoteId, version);
    if (input.idempotencyKey) {
      const dup = await one<{ id: string; status: string }>(tx, "SELECT id, status FROM emails WHERE idempotency_key=$1", [
        `${ctx.orgId}:${input.idempotencyKey}`,
      ]);
      if (dup) return { emailId: dup.id, status: dup.status, duplicate: true, link: null };
    }
    const link = await createShareLink(tx, ctx.orgId, quoteId, version, v.snapshot.validUntil);
    const body = input.body.includes("{lien}") ? input.body.replaceAll("{lien}", link.url) : `${input.body}\n\nConsulter le devis : ${link.url}`;
    const mail = await sendMail(tx, {
      orgId: ctx.orgId,
      quoteId,
      kind: "quote",
      to: input.to,
      subject: input.subject,
      body,
      attachmentVersionId: v.id,
      idempotencyKey: input.idempotencyKey ? `${ctx.orgId}:${input.idempotencyKey}` : null,
    });
    if (mail.status === "sent") {
      await tx.query(
        "UPDATE quotes SET status = CASE WHEN status='ready' THEN 'sent' ELSE status END, sent_at=coalesce(sent_at, now()), updated_at=now() WHERE id=$1 AND org_id=$2",
        [quoteId, ctx.orgId],
      );
    }
    await addEvent(tx, ctx, quoteId, version, mail.status === "sent" ? "sent" : "send_failed", {
      to: input.to,
      email_id: mail.id,
      status: mail.status,
      error: mail.error,
    });
    return { emailId: mail.id, status: mail.status, error: mail.error, duplicate: false, link: link.url };
  });
}

/** Lien de consultation sans envoi d'e-mail (à transmettre par un autre moyen). */
export async function getShareLink(ctx: Ctx, quoteId: string) {
  requireWritable(ctx);
  const r = await getQuoteRow(ctx.db, ctx, quoteId);
  if (!PENDING_STATUSES.includes(r.status as QuoteStatus)) throw conflict("Le devis doit être émis et en attente de réponse");
  const v = await getVersion(ctx.db, ctx.orgId, quoteId, num(r.current_version));
  const link = await createShareLink(ctx.db, ctx.orgId, quoteId, v.version, v.snapshot.validUntil);
  await addEvent(ctx.db, ctx, quoteId, v.version, "link.created");
  return link;
}

export async function resolveShareToken(q: Queryable, token: string) {
  const link = await one<{
    id: string;
    org_id: string;
    quote_id: string;
    version: unknown;
    expires_at: Date;
    revoked_at: Date | null;
    first_viewed_at: Date | null;
  }>(q, "SELECT * FROM share_links WHERE token_hash=$1", [sha256(String(token))]);
  if (!link || link.expires_at < new Date()) return null;
  const quote = await one<Record<string, unknown>>(q, "SELECT * FROM quotes WHERE id=$1 AND org_id=$2", [link.quote_id, link.org_id]);
  if (!quote) return null;
  const v = await getVersion(q, link.org_id, link.quote_id, num(link.version));
  const isCurrent = num(quote.current_version) === v.version;
  const status = quote.status as QuoteStatus;
  const canRespond = !link.revoked_at && isCurrent && ["ready", "sent", "viewed"].includes(status) && v.snapshot.validUntil >= parisDate(new Date());
  return { link, quote, version: v, isCurrent, status, canRespond, revoked: !!link.revoked_at };
}

/** Consultation par le client via le lien sécurisé : seule méthode fiable pour le statut « Consulté ». */
export async function recordClientView(q: Queryable, token: string, meta: { ip: string; userAgent: string }) {
  await hitRate(q, "public.view", meta.ip);
  const r = await resolveShareToken(q, token);
  if (!r) return null;
  if (!r.link.first_viewed_at) {
    await q.query("UPDATE share_links SET first_viewed_at=now() WHERE id=$1", [r.link.id]);
    await q.query(
      "UPDATE quotes SET status = CASE WHEN status IN ('ready','sent') THEN 'viewed' ELSE status END, viewed_at=coalesce(viewed_at, now()) WHERE id=$1",
      [r.link.quote_id],
    );
    await q.query(
      "INSERT INTO document_events (org_id, quote_id, version, type, actor_type, data, ip, user_agent) VALUES ($1,$2,$3,'viewed','client','{}',$4,$5)",
      [r.link.org_id, r.link.quote_id, r.version.version, meta.ip, meta.userAgent.slice(0, 300)],
    );
    // L'artisan est prévenu de la première ouverture de chaque lien.
    const org = await one<{ email: string }>(q, "SELECT email FROM organizations WHERE id=$1", [r.link.org_id]);
    if (org?.email) {
      await sendMail(q, {
        orgId: r.link.org_id,
        quoteId: r.link.quote_id,
        kind: "notification",
        to: org.email,
        subject: `Devis ${r.version.number} consulté par ${r.version.snapshot.customer.name}`,
        body: `${r.version.snapshot.customer.name} vient d'ouvrir le devis ${r.version.number} (version ${r.version.version}).\n\n${appUrl("/app/devis/" + r.link.quote_id)}`,
      });
    }
  }
  return r;
}

export const responseSchema = z.object({
  decision: z.enum(["accept", "refuse"]),
  name: z.string().trim().min(2, "Indiquez vos nom et prénom").max(160),
  consent: z.boolean().optional(),
  reason: z.string().trim().max(2000).optional().default(""),
  reasonCode: z.enum(REFUSAL_CODES).optional(),
  vatAttestation: z.boolean().optional().default(false),
  earlyStart: z.boolean().optional().default(false),
  /** Lignes en option retenues par le client */
  options: z.array(z.string()).max(200).optional().default([]),
});

/** Réponse du client depuis le lien : rattachée à la version exacte qu'il a consultée. */
export async function respondFromLink(db: Ctx["db"], token: string, raw: unknown, meta: { ip: string; userAgent: string }) {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const input = parsed.data;
  if (input.decision === "accept" && !input.consent) throw badRequest("Cochez la case « Bon pour accord » pour accepter");
  await hitRate(db, "public.respond", meta.ip);
  return db.transaction(async (tx) => {
    const r = await resolveShareToken(tx, token);
    if (!r) throw notFound("Lien invalide ou expiré");
    const locked = await one<{ status: QuoteStatus; current_version: unknown }>(
      tx,
      "SELECT status, current_version FROM quotes WHERE id=$1 FOR UPDATE",
      [r.link.quote_id],
    );
    if (!locked || num(locked.current_version) !== r.version.version || r.revoked) {
      throw conflict("Ce devis a été remplacé par une nouvelle version. Utilisez le dernier lien reçu.");
    }
    if (!["ready", "sent", "viewed"].includes(locked.status)) throw conflict("Ce devis n'attend plus de réponse");
    if (r.version.snapshot.validUntil < parisDate(new Date())) throw conflict("La durée de validité de ce devis est dépassée");
    const accepted = input.decision === "accept";
    const consumer = r.version.snapshot.consumer;
    const chosen = accepted ? validChoice(r.version.snapshot, input.options) : [];
    if (!chosen) throw badRequest("Option inconnue : rechargez la page du devis");
    const finalCalc = acceptedCalc(r.version.snapshot, chosen);
    if (accepted && consumer?.reducedVatBp.length && !input.vatAttestation) {
      throw badRequest("Cochez l'attestation sur le taux réduit de TVA pour accepter");
    }
    await tx.query(
      `UPDATE quotes SET status=$2, responded_at=now(), accepted_version=$3, refusal_reason=$4, accepted_options=$5,
         total_ht_cents=$6, total_ttc_cents=$7, updated_at=now() WHERE id=$1`,
      [
        r.link.quote_id,
        accepted ? "accepted" : "refused",
        accepted ? r.version.version : null,
        accepted ? "" : (input.reasonCode ?? ""),
        JSON.stringify(chosen),
        accepted ? finalCalc.totalHtCents : r.version.snapshot.calc.totalHtCents,
        accepted ? finalCalc.totalTtcCents : r.version.snapshot.calc.totalTtcCents,
      ],
    );
    // Éléments de preuve conservés : version, empreinte du PDF, nom saisi, date, adresse IP, navigateur.
    await tx.query(
      `INSERT INTO document_events (org_id, quote_id, version, type, actor_type, data, ip, user_agent)
       VALUES ($1,$2,$3,$4,'client',$5,$6,$7)`,
      [
        r.link.org_id,
        r.link.quote_id,
        r.version.version,
        accepted ? "accepted" : "refused",
        JSON.stringify({
          name: input.name,
          consent_text: accepted ? "Bon pour accord" : null,
          reason: input.reason,
          reason_code: accepted ? null : (input.reasonCode ?? null),
          vat_attestation: accepted && consumer?.reducedVatBp.length ? reducedVatAttestation(consumer.reducedVatBp) : null,
          withdrawal_period: accepted && consumer?.withdrawal ? true : null,
          early_start_requested: accepted && consumer?.withdrawal ? input.earlyStart : null,
          pdf_sha256: r.version.pdfSha256,
          total_ttc_cents: accepted ? finalCalc.totalTtcCents : r.version.snapshot.calc.totalTtcCents,
          ...(r.version.snapshot.calc.options ? { options: chosen, options_offered: snapshotOptions(r.version.snapshot).map((o) => o.label) } : {}),
          via: "lien sécurisé",
        }),
        meta.ip,
        meta.userAgent.slice(0, 300),
      ],
    );
    if (accepted)
      await enqueueWebhook(tx, r.link.org_id, "quote.accepted", acceptedPayload(r.link.quote_id, r.version.snapshot, r.version.version, finalCalc, "lien sécurisé"));
    const org = await one<{ email: string; trade_name: string }>(tx, "SELECT email, trade_name FROM organizations WHERE id=$1", [r.link.org_id]);
    if (org?.email) {
      await sendMail(tx, {
        orgId: r.link.org_id,
        quoteId: r.link.quote_id,
        kind: "notification",
        to: org.email,
        subject: `Devis ${r.version.number} ${accepted ? "accepté" : "refusé"} par ${input.name}`,
        body: `Le devis ${r.version.number} (version ${r.version.version}) a été ${accepted ? "accepté" : "refusé"} en ligne par ${input.name}.${!accepted && input.reasonCode ? "\nRaison : " + REFUSAL_REASONS[input.reasonCode] : ""}${input.reason ? "\nMotif : " + input.reason : ""}\n\n${appUrl("/app/devis/" + r.link.quote_id)}`,
      });
    }
    return { status: accepted ? "accepted" : "refused" };
  });
}

/** Données envoyées aux webhooks quand un devis est signé. */
export function acceptedPayload(quoteId: string, s: QuoteSnapshot, version: number, calc: { totalHtCents: number; totalTtcCents: number }, via: string) {
  return {
    quote_id: quoteId,
    number: s.number,
    version,
    title: s.quote.title,
    customer_id: s.customer.id,
    customer_name: s.customer.name,
    total_ht_cents: calc.totalHtCents,
    total_ttc_cents: calc.totalTtcCents,
    accepted_via: via,
  };
}

/** Acceptation ou refus enregistré par l'artisan (devis signé sur papier, accord écrit...). */
export async function recordResponseManually(ctx: Ctx, quoteId: string, raw: unknown) {
  requireWritable(ctx);
  const schema = z.object({
    decision: z.enum(["accept", "refuse"]),
    version: z.coerce.number().int().min(1),
    proof: z.string().trim().min(3, "Précisez la preuve de l'acceptation (ex. devis signé reçu le...)").max(2000),
    reasonCode: z.enum(REFUSAL_CODES).optional(),
    options: z.array(z.string()).max(200).optional().default([]),
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const input = parsed.data;
  return ctx.db.transaction(async (tx) => {
    const r = await one<{ status: QuoteStatus; current_version: unknown }>(
      tx,
      "SELECT status, current_version FROM quotes WHERE id=$1 AND org_id=$2 FOR UPDATE",
      [quoteId, ctx.orgId],
    );
    if (!r) throw notFound("Devis introuvable");
    if (num(r.current_version) !== input.version) throw conflict("Seule la dernière version émise peut être acceptée");
    if (!PENDING_STATUSES.includes(r.status) && r.status !== "expired") throw conflict("Ce devis n'attend pas de réponse");
    const accepted = input.decision === "accept";
    const v = await getVersion(tx, ctx.orgId, quoteId, input.version);
    const chosen = accepted ? validChoice(v.snapshot, input.options) : [];
    if (!chosen) throw badRequest("Option inconnue");
    const finalCalc = acceptedCalc(v.snapshot, chosen);
    await tx.query(
      `UPDATE quotes SET status=$3, responded_at=now(), accepted_version=$4, refusal_reason=$5, accepted_options=$6,
         total_ht_cents=$7, total_ttc_cents=$8, updated_at=now() WHERE id=$1 AND org_id=$2`,
      [
        quoteId,
        ctx.orgId,
        accepted ? "accepted" : "refused",
        accepted ? input.version : null,
        accepted ? "" : (input.reasonCode ?? ""),
        JSON.stringify(chosen),
        accepted ? finalCalc.totalHtCents : v.snapshot.calc.totalHtCents,
        accepted ? finalCalc.totalTtcCents : v.snapshot.calc.totalTtcCents,
      ],
    );
    await addEvent(tx, ctx, quoteId, input.version, accepted ? "accepted" : "refused", {
      proof: input.proof,
      via: "saisie par l'entreprise",
      ...(accepted || !input.reasonCode ? {} : { reason_code: input.reasonCode }),
      ...(accepted && v.snapshot.calc.options ? { options: chosen } : {}),
    });
    if (accepted) await enqueueWebhook(tx, ctx.orgId, "quote.accepted", acceptedPayload(quoteId, v.snapshot, input.version, finalCalc, "saisie par l'entreprise"));
    return { status: accepted ? "accepted" : "refused" };
  });
}

/* ------------------------------------------------------------------ */
/* Autres actions                                                      */
/* ------------------------------------------------------------------ */

export async function duplicateQuote(ctx: Ctx, quoteId: string, opts: { replace?: boolean; customerId?: string } = {}) {
  requireWritable(ctx);
  const src = await getDraft(ctx, quoteId);
  // Vers un autre client : même contenu, mais le lieu des travaux est celui du nouveau client.
  const otherCustomer = !opts.replace && opts.customerId && opts.customerId !== src.customerId ? opts.customerId : null;
  if (otherCustomer && !isUuid(otherCustomer)) throw badRequest("Client invalide");
  const newId = await createQuote(ctx, { customerId: otherCustomer ?? src.customerId });
  const sections = src.sections.map((s) => ({ ...s, id: randomUUID(), lines: s.lines.map((l) => ({ ...l, id: randomUUID() })) }));
  const fresh = await getDraft(ctx, newId);
  await saveDraft(
    ctx,
    newId,
    otherCustomer
      ? { ...src, customerId: otherCustomer, site: fresh.site, sections }
      : { ...src, title: src.title + (opts.replace ? "" : " (copie)"), sections },
    fresh.draftRevision,
  );
  if (opts.replace) {
    await ctx.db.query(
      "UPDATE quotes SET status='superseded', updated_at=now() WHERE id=$1 AND org_id=$2 AND status IN ('ready','sent','viewed','refused','expired')",
      [quoteId, ctx.orgId],
    );
    await addEvent(ctx.db, ctx, quoteId, null, "replaced", { by: newId });
  }
  await addEvent(ctx.db, ctx, newId, null, "duplicated", { from: quoteId });
  return newId;
}

/**
 * Avenant : nouveau devis rattaché à un devis accepté, pour des travaux supplémentaires
 * ou modifiés. Il reprend le client, le chantier et les conditions, puis suit son propre
 * cycle (émission, acceptation, facture). Les avenants d'un avenant se rattachent au devis initial.
 */
export async function createAmendment(ctx: Ctx, quoteId: string) {
  requireWritable(ctx);
  const src = await getDraft(ctx, quoteId);
  const rootId = src.amendment?.parentId ?? quoteId;
  const root = rootId === quoteId ? src : await getDraft(ctx, rootId);
  if (root.status !== "accepted") throw conflict("Un avenant se rattache à un devis accepté");
  const index = await ctx.db.transaction(async (tx) => {
    // Verrou sur le devis initial : deux avenants créés en même temps ne prennent pas le même numéro.
    await tx.query("SELECT id FROM quotes WHERE id=$1 AND org_id=$2 FOR UPDATE", [rootId, ctx.orgId]);
    const r = await one<{ n: unknown }>(tx, "SELECT coalesce(max(amendment_index), 0) + 1 AS n FROM quotes WHERE amends_quote_id=$1 AND org_id=$2", [
      rootId,
      ctx.orgId,
    ]);
    return num(r?.n);
  });
  const newId = await createQuote(ctx, { customerId: root.customerId });
  await ctx.db.query("UPDATE quotes SET amends_quote_id=$3, amendment_index=$4 WHERE id=$1 AND org_id=$2", [newId, ctx.orgId, rootId, index]);
  const fresh = await getDraft(ctx, newId);
  await saveDraft(
    ctx,
    newId,
    {
      ...fresh,
      title: `Avenant n° ${index}${root.title ? ` : ${root.title}` : ""}`,
      site: root.site,
      paymentTerms: root.paymentTerms,
      contractPlace: root.contractPlace,
      reverseCharge: root.reverseCharge,
      retentionPercent: root.retentionPercent,
      priceRevision: root.priceRevision ?? null,
      energyAid: root.energyAid ?? null,
      template: root.template,
      sections: [{ id: randomUUID(), title: "Travaux supplémentaires", description: "", lines: [] }],
    },
    fresh.draftRevision,
  );
  await addEvent(ctx.db, ctx, rootId, null, "amendment_created", { amendment: newId, index });
  await addEvent(ctx.db, ctx, newId, null, "amendment_of", { from: rootId, index });
  return newId;
}

/** Avenants d'un devis, dans l'ordre. */
export async function listAmendments(ctx: Ctx, quoteId: string) {
  return (
    await ctx.db.query<Record<string, unknown>>(
      `SELECT id, number, title, status, amendment_index, total_ht_cents, total_ttc_cents FROM quotes
       WHERE amends_quote_id=$1 AND org_id=$2 ORDER BY amendment_index`,
      [quoteId, ctx.orgId],
    )
  ).map((r) => ({
    id: String(r.id),
    number: (r.number as string | null) ?? null,
    title: String(r.title),
    status: r.status as QuoteStatus,
    index: num(r.amendment_index),
    htCents: num(r.total_ht_cents),
    ttcCents: num(r.total_ttc_cents),
  }));
}

export async function cancelQuote(ctx: Ctx, quoteId: string, reason: string) {
  requireWritable(ctx);
  const r = await getQuoteRow(ctx.db, ctx, quoteId);
  if (r.status === "accepted" && !reason.trim()) throw badRequest("Indiquez le motif d'annulation d'un devis accepté");
  if (r.status === "canceled") return;
  await ctx.db.query("UPDATE quotes SET status='canceled', updated_at=now() WHERE id=$1 AND org_id=$2", [quoteId, ctx.orgId]);
  await ctx.db.query("UPDATE share_links SET revoked_at=now() WHERE quote_id=$1 AND revoked_at IS NULL", [quoteId]);
  await addEvent(ctx.db, ctx, quoteId, num(r.current_version) || null, "canceled", { reason, previous_status: r.status });
}

export async function setArchived(ctx: Ctx, quoteId: string, archived: boolean) {
  requireWritable(ctx);
  await getQuoteRow(ctx.db, ctx, quoteId);
  await ctx.db.query(`UPDATE quotes SET archived_at=${archived ? "now()" : "NULL"} WHERE id=$1 AND org_id=$2`, [quoteId, ctx.orgId]);
}

/** Supprime un brouillon jamais émis. Un devis émis n'est jamais supprimé. */
export async function deleteDraft(ctx: Ctx, quoteId: string) {
  requireWritable(ctx);
  const r = await getQuoteRow(ctx.db, ctx, quoteId);
  if (num(r.current_version) > 0) throw conflict("Un devis émis ne peut pas être supprimé : annulez-le ou archivez-le");
  await ctx.db.query("DELETE FROM quotes WHERE id=$1 AND org_id=$2", [quoteId, ctx.orgId]);
}

export async function quoteEvents(ctx: Ctx, quoteId: string) {
  await getQuoteRow(ctx.db, ctx, quoteId);
  return ctx.db.query<{
    id: string;
    type: string;
    version: number | null;
    actor_type: string;
    data: Record<string, unknown>;
    ip: string;
    created_at: Date;
    actor_name: string | null;
  }>(
    `SELECT e.id, e.type, e.version, e.actor_type, e.data, e.ip, e.created_at, u.name AS actor_name
     FROM document_events e LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.quote_id=$1 AND e.org_id=$2 ORDER BY e.created_at DESC, e.id`,
    [quoteId, ctx.orgId],
  );
}

export async function quoteEmails(ctx: Ctx, quoteId: string) {
  return ctx.db.query<{ id: string; kind: string; to_address: string; subject: string; status: string; error: string | null; created_at: Date }>(
    "SELECT id, kind, to_address, subject, status, error, created_at FROM emails WHERE quote_id=$1 AND org_id=$2 ORDER BY created_at DESC",
    [quoteId, ctx.orgId],
  );
}

export async function addEvent(q: Queryable, ctx: Ctx, quoteId: string, version: number | null, type: string, data: unknown = {}) {
  await q.query(
    "INSERT INTO document_events (org_id, quote_id, version, type, actor_type, actor_id, data, ip, user_agent) VALUES ($1,$2,$3,$4,'user',$5,$6,$7,$8)",
    [ctx.orgId, quoteId, version, type, ctx.userId, JSON.stringify(data), ctx.ip, ctx.userAgent.slice(0, 300)],
  );
  await audit(q, { orgId: ctx.orgId, userId: ctx.userId, action: "quote." + type, target: quoteId, ip: ctx.ip });
}

/** Passe en « Expiré » les devis en attente dont la validité est dépassée. */
export async function expireQuotes(q: Queryable, orgId?: string) {
  const today = parisDate(new Date());
  const rows = await q.query<{ id: string; org_id: string; current_version: unknown }>(
    `UPDATE quotes SET status='expired', updated_at=now()
     WHERE status IN ('ready','sent','viewed') AND valid_until < $1 AND ($2::uuid IS NULL OR org_id=$2)
     RETURNING id, org_id, current_version`,
    [today, orgId ?? null],
  );
  for (const r of rows) {
    await q.query("INSERT INTO document_events (org_id, quote_id, version, type, actor_type) VALUES ($1,$2,$3,'expired','system')", [
      r.org_id,
      r.id,
      num(r.current_version),
    ]);
  }
  return rows.length;
}

export function assertNotSupport(ctx: Ctx) {
  if (ctx.supportAccess) throw forbidden("Action impossible en accès support");
}
