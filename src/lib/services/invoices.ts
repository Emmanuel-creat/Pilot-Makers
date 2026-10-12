/**
 * Factures d'acompte, factures de solde, avoirs et encaissements (actions 143 à 149).
 *
 * Une facture est toujours émise d'un bloc, figée et numérotée sans trou :
 * photographie, PDF et empreintes sont enregistrés ensemble et ne changent plus.
 * Une erreur se corrige par un avoir, jamais par une modification.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { parseScaled } from "@/lib/calc/decimal";
import { computeQuote, type CalcResult } from "@/lib/calc/engine";
import { draftToCalcInput } from "@/lib/calc/draft";
import { bpToInput, centsToInput, formatEuros, formatPercent } from "@/lib/calc/format";
import type { Database, Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, conflict, HttpError, notFound } from "@/lib/http";
import { renderQuotePdf, type PdfDocOptions } from "@/lib/pdf/quote-pdf";
import { canonicalJson, sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, logError, requireWritable } from "./context";
import type { Customer } from "./customers";
import { appUrl, renderTemplate, sendMail } from "./mail";
import type { Organization } from "./organization";
import { REVERSE_CHARGE_MENTION, retentionBp, retentionCents, retentionLabel, retentionMention } from "./btp";
import { addDays, buildSnapshot, frDate, getVersion, orgRow, parisDate, addEvent, quoteVatExempt } from "./quotes";
import type { DraftSection, QuoteDraft, QuoteSnapshot } from "./quote-types";

export const INVOICE_KINDS = { deposit: "Facture d'acompte", final: "Facture", credit_note: "Avoir" } as const;
export type InvoiceKind = keyof typeof INVOICE_KINDS;

export const PAYMENT_METHODS = {
  virement: "Virement",
  cheque: "Chèque",
  carte: "Carte bancaire",
  especes: "Espèces",
  prelevement: "Prélèvement",
  autre: "Autre",
} as const;

export interface Deduction {
  number: string;
  issueDate: string;
  htCents: number;
  vatCents: number;
  ttcCents: number;
}

/** Photographie d'une facture : celle d'un devis, complétée des informations de facturation. */
export interface InvoiceSnapshot extends QuoteSnapshot {
  invoice: {
    kind: InvoiceKind;
    number: string;
    issueDate: string;
    dueDate: string;
    quoteNumber: string | null;
    quoteVersion: number | null;
    quoteIssueDate: string | null;
    creditedNumber: string | null;
    deductions: Deduction[];
    /** Retenue de garantie déduite de la facture de solde */
    retention?: { bp: number; cents: number };
    amountDueCents: number;
    bank: { holder: string; iban: string; bic: string };
    latePenalty: string;
    professional: boolean;
    paymentTerms: string;
  };
}

export type InvoiceStatus = "issued" | "partial" | "paid" | "overdue" | "canceled" | "credit";

export const INVOICE_STATUSES: Record<InvoiceStatus, string> = {
  issued: "À encaisser",
  partial: "Partiellement payée",
  paid: "Payée",
  overdue: "En retard",
  canceled: "Annulée par avoir",
  credit: "Avoir",
};

export interface InvoiceRow {
  id: string;
  org_id: string;
  quote_id: string | null;
  customer_id: string | null;
  kind: InvoiceKind;
  number: string;
  credited_invoice_id: string | null;
  title: string;
  issue_date: string;
  due_date: string;
  total_ht_cents: number;
  total_vat_cents: number;
  total_ttc_cents: number;
  amount_due_cents: number;
  paid_cents: number;
  credited_cents: number;
  balance_cents: number;
  status: InvoiceStatus;
  reminder_count: number;
  sent_at: Date | null;
  issued_at: Date;
  customer_name?: string;
  quote_number?: string | null;
  pdf_sha256: string;
}

function isoDate(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

export function invoiceStatus(
  r: { kind: string; amount_due_cents: number; paid_cents: number; credited_cents: number; due_date: string },
  today = parisDate(new Date()),
): InvoiceStatus {
  if (r.kind === "credit_note") return "credit";
  if (r.credited_cents >= r.amount_due_cents) return "canceled";
  const balance = r.amount_due_cents - r.paid_cents - r.credited_cents;
  if (balance <= 0) return "paid";
  if (r.due_date < today) return "overdue";
  return r.paid_cents > 0 ? "partial" : "issued";
}

export function mapInvoice(r: Record<string, unknown>): InvoiceRow {
  const base = {
    ...(r as unknown as InvoiceRow),
    issue_date: isoDate(r.issue_date),
    due_date: isoDate(r.due_date),
    total_ht_cents: num(r.total_ht_cents),
    total_vat_cents: num(r.total_vat_cents),
    total_ttc_cents: num(r.total_ttc_cents),
    amount_due_cents: num(r.amount_due_cents),
    paid_cents: num(r.paid_cents),
    credited_cents: num(r.credited_cents),
    reminder_count: num(r.reminder_count),
  };
  delete (base as Record<string, unknown>).pdf;
  delete (base as Record<string, unknown>).snapshot;
  return {
    ...base,
    balance_cents: base.kind === "credit_note" ? 0 : base.amount_due_cents - base.paid_cents - base.credited_cents,
    status: invoiceStatus(base),
  };
}

/* ------------------------------------------------------------------ */
/* Lecture                                                             */
/* ------------------------------------------------------------------ */

const LIST_COLUMNS = `i.id, i.org_id, i.quote_id, i.customer_id, i.kind, i.number, i.credited_invoice_id, i.title, i.issue_date, i.due_date,
  i.total_ht_cents, i.total_vat_cents, i.total_ttc_cents, i.amount_due_cents, i.paid_cents, i.credited_cents, i.reminder_count,
  i.sent_at, i.issued_at, i.pdf_sha256, i.snapshot->'customer'->>'name' AS customer_name, q.number AS quote_number`;

export async function listInvoices(ctx: Ctx, f: { status?: string; q?: string; quoteId?: string; limit?: number } = {}) {
  const params: unknown[] = [ctx.orgId];
  const where = ["i.org_id=$1"];
  if (f.quoteId) {
    params.push(f.quoteId);
    where.push(`i.quote_id=$${params.length}`);
  }
  if (f.q?.trim()) {
    params.push(`%${f.q.trim().toLowerCase()}%`);
    where.push(
      `(lower(i.number) LIKE $${params.length} OR lower(i.snapshot->'customer'->>'name') LIKE $${params.length} OR lower(i.title) LIKE $${params.length})`,
    );
  }
  params.push(Math.min(f.limit ?? 500, 2000));
  const rows = await ctx.db.query(
    `SELECT ${LIST_COLUMNS} FROM invoices i LEFT JOIN quotes q ON q.id=i.quote_id
     WHERE ${where.join(" AND ")} ORDER BY i.issued_at DESC LIMIT $${params.length}`,
    params,
  );
  const list = rows.map(mapInvoice);
  return f.status ? list.filter((i) => i.status === f.status) : list;
}

export async function getInvoice(ctx: Ctx, id: string, q: Queryable = ctx.db) {
  const r = await one(q, `SELECT ${LIST_COLUMNS}, i.snapshot FROM invoices i LEFT JOIN quotes q ON q.id=i.quote_id WHERE i.id=$1 AND i.org_id=$2`, [
    id,
    ctx.orgId,
  ]);
  if (!r) throw notFound("Facture introuvable");
  return { ...mapInvoice(r), snapshot: r.snapshot as InvoiceSnapshot };
}

export async function getInvoicePdf(ctx: Ctx, id: string) {
  const r = await one<{ number: string; pdf: Uint8Array; pdf_sha256: string }>(
    ctx.db,
    "SELECT number, pdf, pdf_sha256 FROM invoices WHERE id=$1 AND org_id=$2",
    [id, ctx.orgId],
  );
  if (!r) throw notFound("Facture introuvable");
  return r;
}

export async function listPayments(ctx: Ctx, invoiceId: string) {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT p.*, u.name AS user_name FROM invoice_payments p LEFT JOIN users u ON u.id=p.created_by
     WHERE p.invoice_id=$1 AND p.org_id=$2 ORDER BY p.paid_on, p.created_at`,
    [invoiceId, ctx.orgId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    amount_cents: num(r.amount_cents),
    paid_on: isoDate(r.paid_on),
    method: String(r.method) as keyof typeof PAYMENT_METHODS,
    reference: String(r.reference ?? ""),
    canceled_at: (r.canceled_at as Date | null) ?? null,
    user_name: String(r.user_name ?? ""),
  }));
}

/** Synthèse pour le tableau de bord : montants réellement facturés et encaissés. */
export async function invoiceSummary(ctx: Ctx) {
  const all = await listInvoices(ctx, { limit: 2000 });
  const open = all.filter((i) => i.kind !== "credit_note" && i.balance_cents > 0);
  return {
    toCollectCents: open.reduce((s, i) => s + i.balance_cents, 0),
    overdueCents: open.filter((i) => i.status === "overdue").reduce((s, i) => s + i.balance_cents, 0),
    overdueCount: open.filter((i) => i.status === "overdue").length,
    openCount: open.length,
  };
}

/* ------------------------------------------------------------------ */
/* Émission                                                            */
/* ------------------------------------------------------------------ */

interface AcceptedQuote {
  id: string;
  number: string;
  customer_id: string | null;
  accepted_version: number;
  snapshot: QuoteSnapshot;
  versionId: string;
}

async function acceptedQuote(q: Queryable, ctx: Ctx, quoteId: string): Promise<AcceptedQuote> {
  const r = await one<{ id: string; number: string | null; status: string; customer_id: string | null; accepted_version: unknown }>(
    q,
    "SELECT id, number, status, customer_id, accepted_version FROM quotes WHERE id=$1 AND org_id=$2 FOR UPDATE",
    [quoteId, ctx.orgId],
  );
  if (!r) throw notFound("Devis introuvable");
  if (r.status !== "accepted" || !r.accepted_version) throw conflict("Seul un devis accepté peut être facturé");
  const v = await getVersion(q, ctx.orgId, quoteId, num(r.accepted_version));
  return {
    id: r.id,
    number: r.number ?? v.number,
    customer_id: r.customer_id,
    accepted_version: num(r.accepted_version),
    snapshot: v.snapshot,
    versionId: v.id,
  };
}

async function customerRow(q: Queryable, ctx: Ctx, id: string | null, fallback: QuoteSnapshot["customer"]): Promise<Customer> {
  const c = id ? await one<Customer>(q, "SELECT * FROM customers WHERE id=$1 AND org_id=$2", [id, ctx.orgId]) : null;
  if (c) return c;
  // Client supprimé depuis : on reprend ses coordonnées figées dans le devis.
  return {
    id: fallback.id,
    type: fallback.type,
    civility: "",
    first_name: "",
    last_name: fallback.name,
    company_name: fallback.type === "particulier" ? "" : fallback.name,
    billing_line1: fallback.billing_line1,
    billing_line2: fallback.billing_line2,
    billing_postal_code: fallback.billing_postal_code,
    billing_city: fallback.billing_city,
    billing_country: fallback.billing_country,
    email: fallback.email,
    phone: fallback.phone,
    siren: fallback.siren,
    vat_number: fallback.vat_number,
  } as unknown as Customer;
}

interface IssueArgs {
  kind: InvoiceKind;
  quote: AcceptedQuote | null;
  customer: Customer;
  title: string;
  site: QuoteSnapshot["quote"]["site"];
  sections: DraftSection[];
  globalDiscount: string;
  paymentTerms: string;
  deductions: Deduction[];
  creditedInvoice: { id: string; number: string } | null;
  dueInDays: number;
  extraMentions?: string[];
  /** Sous-traitance : facture sans TVA, autoliquidée par le client */
  reverseCharge?: boolean;
  /** Retenue de garantie à déduire, en points de base du TTC */
  retentionBp?: number;
}

function invoiceMentions(org: Organization, a: IssueArgs, professional: boolean, dueDate: string): string[] {
  const m: string[] = [];
  if (a.quote) m.push(`Selon devis n° ${a.quote.number} du ${frDate(a.quote.snapshot.issueDate)}, accepté par le client.`);
  if (a.creditedInvoice) m.push(`Avoir sur la facture n° ${a.creditedInvoice.number}.`);
  if (org.vat_regime === "franchise") m.push("TVA non applicable, article 293 B du Code général des impôts.");
  else if (a.reverseCharge) m.push(REVERSE_CHARGE_MENTION);
  if (a.retentionBp && a.kind === "final") m.push(retentionMention(a.retentionBp));
  if (a.kind !== "credit_note") {
    m.push(a.dueInDays === 0 ? "Paiement à réception de la facture." : `Date d'échéance : ${frDate(dueDate)}.`);
    m.push("Pas d'escompte pour paiement anticipé.");
    if (org.late_penalty_text.trim()) m.push(org.late_penalty_text.trim());
    if (professional)
      m.push("Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 euros (article L441-10 du Code de commerce).");
  }
  if (org.insurance_name.trim() && org.insurance_decennale) {
    m.push(
      [
        `Assurance décennale : ${org.insurance_name.trim()}`,
        org.insurance_policy.trim() ? `contrat n° ${org.insurance_policy.trim()}` : "",
        org.insurance_area.trim() ? `couverture : ${org.insurance_area.trim()}` : "",
      ]
        .filter(Boolean)
        .join(", ") + ".",
    );
  }
  return [...m, ...(a.extraMentions ?? [])];
}

export function invoicePdfOptions(s: InvoiceSnapshot): PdfDocOptions {
  const inv = s.invoice;
  const title = inv.kind === "credit_note" ? "AVOIR" : inv.kind === "deposit" ? "FACTURE D'ACOMPTE" : "FACTURE";
  const name = inv.kind === "credit_note" ? "Avoir" : inv.kind === "deposit" ? "Facture d'acompte" : "Facture";
  const afterTotals: [string, string, boolean][] = [];
  for (const d of inv.deductions) {
    afterTotals.push([`Acompte ${d.number} du ${frDate(d.issueDate)} (dont TVA ${formatEuros(d.vatCents)})`, "-" + formatEuros(d.ttcCents), false]);
  }
  if (inv.retention?.cents) afterTotals.push([retentionLabel(inv.retention.bp), "-" + formatEuros(inv.retention.cents), false]);
  if (inv.deductions.length || inv.retention?.cents)
    afterTotals.push([inv.kind === "credit_note" ? "Net à rembourser ou à déduire" : "Net à payer", formatEuros(inv.amountDueCents), true]);
  const bank = inv.bank.iban
    ? [
        `Titulaire : ${inv.bank.holder || s.org.legal_name || s.org.trade_name}`,
        `IBAN : ${inv.bank.iban}`,
        inv.bank.bic ? `BIC : ${inv.bank.bic}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    : "";
  return {
    title,
    label: `${name} ${inv.number}`,
    meta: [
      `N° ${inv.number}`,
      `Date : ${frDate(inv.issueDate)}`,
      inv.kind === "credit_note" ? "" : `Échéance : ${frDate(inv.dueDate)}`,
      inv.quoteNumber ? `Devis : ${inv.quoteNumber}` : "",
      inv.creditedNumber ? `Facture d'origine : ${inv.creditedNumber}` : "",
    ],
    siteLabel: "Lieu des travaux",
    afterTotals,
    sections: [
      ["Conditions de paiement", inv.paymentTerms],
      ["Coordonnées bancaires", inv.kind === "credit_note" ? "" : bank],
      ["Mentions", s.mentions.join("\n")],
    ],
  };
}

export async function renderInvoicePdf(s: InvoiceSnapshot): Promise<Uint8Array> {
  return renderQuotePdf(s, invoicePdfOptions(s));
}

async function nextNumber(q: Queryable, orgId: string, kind: InvoiceKind, now: Date) {
  const credit = kind === "credit_note";
  const r = await one<{ seq: unknown; prefix: string }>(
    q,
    credit
      ? "UPDATE organizations SET next_credit_seq = next_credit_seq + 1 WHERE id=$1 RETURNING next_credit_seq - 1 AS seq, credit_prefix AS prefix"
      : "UPDATE organizations SET next_invoice_seq = next_invoice_seq + 1 WHERE id=$1 RETURNING next_invoice_seq - 1 AS seq, invoice_prefix AS prefix",
    [orgId],
  );
  const year = parisDate(now).slice(0, 4);
  return `${r!.prefix || (credit ? "AV" : "FA")}-${year}-${String(num(r!.seq)).padStart(4, "0")}`;
}

async function issueInvoiceTx(tx: Queryable, ctx: Ctx, a: IssueArgs): Promise<{ id: string; number: string }> {
  const org = await orgRow(tx, ctx.orgId);
  const vatExempt = quoteVatExempt(org, a);
  const calc: CalcResult = computeQuote(draftToCalcInput({ sections: a.sections, globalDiscount: a.globalDiscount }, vatExempt));
  if (!calc.ok)
    throw badRequest(
      "Montants invalides : " +
        calc.issues
          .filter((i) => i.blocking)
          .map((i) => i.message)
          .join(" ; "),
    );
  if (calc.totalTtcCents <= 0) throw badRequest("Le montant de la facture doit être positif");
  const deducted = a.deductions.reduce((s, d) => s + d.ttcCents, 0);
  const retention = a.retentionBp ? { bp: a.retentionBp, cents: retentionCents(calc.totalTtcCents, a.retentionBp) } : undefined;
  const amountDue = calc.totalTtcCents - deducted - (retention?.cents ?? 0);
  if (amountDue < 0) throw badRequest("Les acomptes déduits dépassent le montant de la facture");
  const now = new Date();
  const number = await nextNumber(tx, ctx.orgId, a.kind, now);
  const issueDate = parisDate(now);
  const dueDate = parisDate(addDays(now, a.dueInDays));
  const professional = a.customer.type !== "particulier";
  const draft: QuoteDraft = {
    id: a.quote?.id ?? randomUUID(),
    number,
    status: "accepted",
    customerId: a.customer.id,
    title: a.title,
    description: "",
    site: a.site,
    validityDays: 1,
    paymentTerms: a.paymentTerms,
    specialConditions: "",
    depositPercent: "",
    estimatedDuration: "",
    estimatedStart: "",
    globalDiscount: a.globalDiscount,
    template: a.quote?.snapshot.template ?? org.quote_template,
    internalNotes: "",
    contractPlace: "etablissement",
    reverseCharge: a.reverseCharge === true,
    retentionPercent: "",
    sections: a.sections,
    draftRevision: 0,
    currentVersion: 0,
    acceptedVersion: null,
    authorName: ctx.userName,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  const base = buildSnapshot({ ctx, d: draft, org, customer: a.customer, calc, issues: [], number, version: 1, now });
  const snapshot: InvoiceSnapshot = {
    ...base,
    validUntil: dueDate,
    mentions: invoiceMentions(org, a, professional, dueDate),
    warnings: [],
    invoice: {
      kind: a.kind,
      number,
      issueDate,
      dueDate,
      quoteNumber: a.quote?.number ?? null,
      quoteVersion: a.quote?.accepted_version ?? null,
      quoteIssueDate: a.quote?.snapshot.issueDate ?? null,
      creditedNumber: a.creditedInvoice?.number ?? null,
      deductions: a.deductions,
      ...(retention ? { retention } : {}),
      amountDueCents: amountDue,
      bank: { holder: org.bank_holder, iban: org.bank_iban, bic: org.bank_bic },
      latePenalty: org.late_penalty_text,
      professional,
      paymentTerms: a.paymentTerms,
    },
  };
  let pdf: Uint8Array;
  try {
    pdf = await renderInvoicePdf(snapshot);
  } catch (e) {
    throw new HttpError(500, "pdf_failed", "La génération du PDF a échoué. L'incident a été signalé.", (e as Error).message);
  }
  const pdfHash = sha256(pdf);
  const snapHash = sha256(canonicalJson(snapshot));
  const row = await one<{ id: string }>(
    tx,
    `INSERT INTO invoices (org_id, quote_id, customer_id, kind, number, credited_invoice_id, title, issue_date, due_date, snapshot, pdf,
       pdf_sha256, snapshot_sha256, total_ht_cents, total_vat_cents, total_ttc_cents, amount_due_cents, issued_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
    [
      ctx.orgId,
      a.quote?.id ?? null,
      a.customer.id && !String(a.customer.id).startsWith("snap") ? a.customer.id : null,
      a.kind,
      number,
      a.creditedInvoice?.id ?? null,
      a.title,
      issueDate,
      dueDate,
      JSON.stringify(snapshot),
      pdf,
      pdfHash,
      snapHash,
      calc.totalHtCents,
      calc.totalVatCents,
      calc.totalTtcCents,
      amountDue,
      ctx.userId,
    ],
  );
  if (a.quote)
    await addEvent(tx, ctx, a.quote.id, a.quote.accepted_version, `invoice.${a.kind}`, {
      invoice_id: row!.id,
      number,
      total_ttc_cents: calc.totalTtcCents,
    });
  await audit(tx, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: `invoice.issue.${a.kind}`,
    target: row!.id,
    data: { number, total_ttc_cents: calc.totalTtcCents, pdf_sha256: pdfHash },
    ip: ctx.ip,
  });
  return { id: row!.id, number };
}

async function withIssue<T>(ctx: Ctx, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  requireWritable(ctx);
  try {
    return await ctx.db.transaction(fn);
  } catch (e) {
    if (e instanceof HttpError && e.code === "pdf_failed") await logError(ctx.db, "pdf.invoice", String(e.details ?? e.message), ctx.orgId, {});
    throw e;
  }
}

async function activeDeposits(q: Queryable, orgId: string, quoteId: string) {
  const rows = await q.query<Record<string, unknown>>(
    "SELECT * FROM invoices WHERE org_id=$1 AND quote_id=$2 AND kind='deposit' ORDER BY issued_at",
    [orgId, quoteId],
  );
  return rows.map(mapInvoice).filter((d) => d.credited_cents < d.total_ttc_cents);
}

/** Part non annulée d'un acompte, TVA comprise, au prorata si un avoir partiel l'a réduit. */
function deductionOf(d: InvoiceRow): Deduction {
  const remaining = d.total_ttc_cents - d.credited_cents;
  const vat = d.total_ttc_cents ? Math.round((d.total_vat_cents * remaining) / d.total_ttc_cents) : 0;
  return { number: d.number, issueDate: d.issue_date, htCents: remaining - vat, vatCents: vat, ttcCents: remaining };
}

/**
 * Facture d'acompte : un pourcentage du devis accepté, ventilé par taux de TVA
 * comme les travaux eux-mêmes.
 */
export async function createDepositInvoice(ctx: Ctx, quoteId: string, input: { percent: string }) {
  let bp: bigint;
  try {
    bp = parseScaled(
      String(input.percent ?? "")
        .replace("%", "")
        .trim(),
      2,
    );
  } catch {
    throw badRequest("Pourcentage d'acompte invalide");
  }
  if (bp <= 0n || bp > 10000n) throw badRequest("Le pourcentage d'acompte doit être compris entre 0 et 100");
  return withIssue(ctx, async (tx) => {
    const quote = await acceptedQuote(tx, ctx, quoteId);
    const existingFinal = await one(tx, "SELECT 1 FROM invoices WHERE quote_id=$1 AND kind='final' AND credited_cents < amount_due_cents", [quoteId]);
    if (existingFinal) throw conflict("La facture de solde est déjà émise : plus d'acompte possible");
    const s = quote.snapshot;
    const pct = formatPercent(Number(bp));
    const groups = s.calc.vatGroups.filter((g) => g.baseCents > 0);
    const lines = groups.map((g) => {
      const amount = Number((BigInt(g.baseCents) * bp + 5000n) / 10000n);
      return {
        id: randomUUID(),
        kind: "item" as const,
        catalogItemId: null,
        nature: "forfait" as const,
        label: `Acompte de ${pct} sur le devis ${quote.number} du ${frDate(s.issueDate)}${groups.length > 1 ? ` (travaux à TVA ${formatPercent(g.vatBp)})` : ""}`,
        description:
          groups.length > 1
            ? `Base des travaux à ce taux : ${formatEuros(g.baseCents)} HT`
            : `Montant total des travaux : ${formatEuros(s.calc.totalHtCents)} HT`,
        quantity: "1",
        unit: "forfait",
        unitPrice: centsToInput(amount),
        unitCost: "",
        discountPercent: "",
        vatPercent: bpToInput(g.vatBp),
        estimated: false,
        estimateNote: "",
      };
    });
    const previous = (await activeDeposits(tx, ctx.orgId, quoteId)).reduce((sum, d) => sum + d.total_ttc_cents - d.credited_cents, 0);
    const preview = computeQuote(
      draftToCalcInput({ sections: [{ id: randomUUID(), title: "", description: "", lines }], globalDiscount: "" }, quoteVatExempt(s.org, s.quote)),
    );
    if (previous + preview.totalTtcCents > s.calc.totalTtcCents) {
      throw badRequest(
        `Les acomptes dépasseraient le montant du devis (déjà facturé : ${formatEuros(previous)} TTC sur ${formatEuros(s.calc.totalTtcCents)})`,
      );
    }
    const customer = await customerRow(tx, ctx, quote.customer_id, s.customer);
    return issueInvoiceTx(tx, ctx, {
      kind: "deposit",
      quote,
      customer,
      title: `Acompte : ${s.quote.title}`,
      site: s.quote.site,
      sections: [{ id: randomUUID(), title: "", description: "", lines }],
      globalDiscount: "",
      paymentTerms: s.quote.paymentTerms,
      deductions: [],
      creditedInvoice: null,
      dueInDays: 0,
      reverseCharge: s.quote.reverseCharge,
    });
  });
}

/** Facture de solde : tous les travaux du devis accepté, acomptes déduits. */
export async function createFinalInvoice(ctx: Ctx, quoteId: string) {
  return withIssue(ctx, async (tx) => {
    const quote = await acceptedQuote(tx, ctx, quoteId);
    const existingFinal = await one(tx, "SELECT number FROM invoices WHERE quote_id=$1 AND kind='final' AND credited_cents < amount_due_cents", [
      quoteId,
    ]);
    if (existingFinal) throw conflict("La facture de solde de ce devis existe déjà");
    const s = quote.snapshot;
    const org = await orgRow(tx, ctx.orgId);
    const deductions = (await activeDeposits(tx, ctx.orgId, quoteId)).map(deductionOf);
    const customer = await customerRow(tx, ctx, quote.customer_id, s.customer);
    const sections = s.sections.map((sec) => ({ ...sec, lines: sec.lines.filter((l) => l.kind !== "pending") }));
    return issueInvoiceTx(tx, ctx, {
      kind: "final",
      quote,
      customer,
      title: s.quote.title,
      site: s.quote.site,
      sections,
      globalDiscount: s.quote.globalDiscount,
      paymentTerms: s.quote.paymentTerms || org.payment_terms,
      deductions,
      creditedInvoice: null,
      dueInDays: num(org.invoice_due_days) || 30,
      reverseCharge: s.quote.reverseCharge,
      retentionBp: retentionBp(s.quote.retentionPercent) || 0,
    });
  });
}

const creditSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("full"), reason: z.string().trim().max(300).default("") }),
  z.object({
    mode: z.literal("partial"),
    label: z.string().trim().min(1, "Indiquez le motif de l'avoir").max(300),
    amountHt: z.string().trim().min(1, "Montant requis"),
    vatPercent: z.string().trim().default("20"),
  }),
]);

/** Avoir total (reprend la facture) ou partiel (un montant hors taxe et son taux). */
export async function createCreditNote(ctx: Ctx, invoiceId: string, raw: unknown) {
  const parsed = creditSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const input = parsed.data;
  return withIssue(ctx, async (tx) => {
    const src = await one<Record<string, unknown>>(tx, "SELECT * FROM invoices WHERE id=$1 AND org_id=$2 FOR UPDATE", [invoiceId, ctx.orgId]);
    if (!src) throw notFound("Facture introuvable");
    const inv = mapInvoice(src);
    const snap = src.snapshot as InvoiceSnapshot;
    if (inv.kind === "credit_note") throw badRequest("Un avoir ne peut pas être annulé par un autre avoir");
    const remaining = inv.amount_due_cents - inv.credited_cents;
    if (remaining <= 0) throw conflict("Cette facture est déjà entièrement annulée");
    const customer = await customerRow(tx, ctx, inv.customer_id, snap.customer);
    let sections: DraftSection[];
    let globalDiscount = "";
    let deductions: Deduction[] = [];
    if (input.mode === "full") {
      if (inv.credited_cents > 0) throw conflict("Un avoir partiel existe déjà : émettez un avoir partiel pour le reste");
      sections = snap.sections.map((sec) => ({ ...sec, id: randomUUID(), lines: sec.lines.map((l) => ({ ...l, id: randomUUID() })) }));
      globalDiscount = snap.quote.globalDiscount;
      deductions = snap.invoice.deductions;
    } else {
      sections = [
        {
          id: randomUUID(),
          title: "",
          description: "",
          lines: [
            {
              id: randomUUID(),
              kind: "item",
              catalogItemId: null,
              nature: "autre",
              label: input.label,
              description: "",
              quantity: "1",
              unit: "forfait",
              unitPrice: input.amountHt,
              unitCost: "",
              discountPercent: "",
              vatPercent: quoteVatExempt(snap.org, snap.quote) ? "0" : input.vatPercent,
              estimated: false,
              estimateNote: "",
            },
          ],
        },
      ];
    }
    const preview = computeQuote(draftToCalcInput({ sections, globalDiscount }, quoteVatExempt(snap.org, snap.quote)));
    const retained = input.mode === "full" ? (snap.invoice.retention?.cents ?? 0) : 0;
    const creditAmount = preview.totalTtcCents - deductions.reduce((s, d) => s + d.ttcCents, 0) - retained;
    if (input.mode === "partial" && creditAmount > remaining) {
      throw badRequest(`L'avoir dépasse le montant restant de la facture (${formatEuros(remaining)} TTC)`);
    }
    const r = await issueInvoiceTx(tx, ctx, {
      kind: "credit_note",
      quote: null,
      customer,
      title:
        `Avoir sur ${inv.number}` +
        (input.mode === "full" && input.reason ? ` : ${input.reason}` : input.mode === "partial" ? ` : ${input.label}` : ""),
      site: snap.quote.site,
      sections,
      globalDiscount,
      paymentTerms: "",
      deductions,
      creditedInvoice: { id: inv.id, number: inv.number },
      dueInDays: 0,
      extraMentions: input.mode === "full" && input.reason ? [`Motif : ${input.reason}.`] : [],
      reverseCharge: snap.quote.reverseCharge,
      retentionBp: input.mode === "full" ? snap.invoice.retention?.bp : undefined,
    });
    await tx.query("UPDATE invoices SET quote_id=$2 WHERE id=$1", [r.id, inv.quote_id]);
    await tx.query("UPDATE invoices SET credited_cents = credited_cents + $2 WHERE id=$1", [inv.id, creditAmount]);
    return r;
  });
}

/* ------------------------------------------------------------------ */
/* Encaissements                                                       */
/* ------------------------------------------------------------------ */

const paymentSchema = z.object({
  amount: z.string().trim().min(1, "Montant requis"),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  method: z.enum(Object.keys(PAYMENT_METHODS) as [keyof typeof PAYMENT_METHODS, ...(keyof typeof PAYMENT_METHODS)[]]),
  reference: z.string().trim().max(200).default(""),
});

async function refreshPaid(q: Queryable, invoiceId: string) {
  await q.query(
    "UPDATE invoices SET paid_cents = coalesce((SELECT sum(amount_cents) FROM invoice_payments WHERE invoice_id=$1 AND canceled_at IS NULL), 0) WHERE id=$1",
    [invoiceId],
  );
}

export async function recordPayment(ctx: Ctx, invoiceId: string, raw: unknown) {
  requireWritable(ctx);
  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const p = parsed.data;
  let cents: number;
  try {
    cents = Number(parseScaled(p.amount, 2));
  } catch {
    throw badRequest("Montant invalide");
  }
  if (cents <= 0) throw badRequest("Le montant doit être positif");
  if (p.paidOn > parisDate(new Date())) throw badRequest("La date d'encaissement ne peut pas être dans le futur");
  return ctx.db.transaction(async (tx) => {
    const src = await one<Record<string, unknown>>(tx, "SELECT * FROM invoices WHERE id=$1 AND org_id=$2 FOR UPDATE", [invoiceId, ctx.orgId]);
    if (!src) throw notFound("Facture introuvable");
    const inv = mapInvoice(src);
    if (inv.kind === "credit_note") throw badRequest("Un avoir ne s'encaisse pas");
    if (cents > inv.balance_cents) throw badRequest(`Le paiement dépasse le reste à payer (${formatEuros(inv.balance_cents)})`);
    const row = await one<{ id: string }>(
      tx,
      `INSERT INTO invoice_payments (org_id, invoice_id, amount_cents, paid_on, method, reference, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [ctx.orgId, invoiceId, cents, p.paidOn, p.method, p.reference, ctx.userId],
    );
    await refreshPaid(tx, invoiceId);
    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "invoice.payment",
      target: invoiceId,
      data: { amount_cents: cents, method: p.method },
      ip: ctx.ip,
    });
    return row!.id;
  });
}

export async function cancelPayment(ctx: Ctx, paymentId: string) {
  requireWritable(ctx);
  await ctx.db.transaction(async (tx) => {
    const p = await one<{ invoice_id: string }>(
      tx,
      "UPDATE invoice_payments SET canceled_at=now(), canceled_by=$3 WHERE id=$1 AND org_id=$2 AND canceled_at IS NULL RETURNING invoice_id",
      [paymentId, ctx.orgId, ctx.userId],
    );
    if (!p) throw notFound("Paiement introuvable");
    await refreshPaid(tx, p.invoice_id);
    await audit(tx, {
      orgId: ctx.orgId,
      userId: ctx.userId,
      action: "invoice.payment_cancel",
      target: p.invoice_id,
      data: { payment: paymentId },
      ip: ctx.ip,
    });
  });
}

/* ------------------------------------------------------------------ */
/* Envoi et relances                                                   */
/* ------------------------------------------------------------------ */

function kindName(kind: InvoiceKind) {
  return kind === "credit_note" ? "avoir" : kind === "deposit" ? "facture d'acompte" : "facture";
}

export function defaultInvoiceMessage(inv: InvoiceRow, org: Pick<Organization, "trade_name">) {
  const name = kindName(inv.kind);
  return {
    subject: `${name.charAt(0).toUpperCase() + name.slice(1)} ${inv.number} - ${org.trade_name}`,
    body:
      `Bonjour,\n\nVeuillez trouver ci-joint notre ${name} n° ${inv.number} d'un montant de ${formatEuros(inv.amount_due_cents)} TTC` +
      (inv.kind === "credit_note" ? ".\n" : `, payable au plus tard le ${frDate(inv.due_date)}.\n`) +
      `\nCordialement,\n${org.trade_name}`,
  };
}

const sendSchema = z.object({
  to: z
    .string()
    .trim()
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Adresse e-mail invalide"),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(10000),
});

export async function sendInvoice(ctx: Ctx, invoiceId: string, raw: unknown) {
  requireWritable(ctx);
  const parsed = sendSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const inv = await getInvoice(ctx, invoiceId);
  const mail = await sendMail(ctx.db, {
    orgId: ctx.orgId,
    quoteId: inv.quote_id,
    kind: inv.kind === "credit_note" ? "credit_note" : "invoice",
    to: parsed.data.to,
    subject: parsed.data.subject,
    body: parsed.data.body,
    attachmentInvoiceId: inv.id,
    invoiceId: inv.id,
  });
  if (mail.status === "sent") await ctx.db.query("UPDATE invoices SET sent_at=coalesce(sent_at, now()) WHERE id=$1", [inv.id]);
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "invoice.send",
    target: inv.id,
    data: { to: parsed.data.to, status: mail.status },
    ip: ctx.ip,
  });
  return mail;
}

export async function invoiceEmails(ctx: Ctx, invoiceId: string) {
  return ctx.db.query<{ id: string; to_address: string; subject: string; status: string; error: string | null; created_at: Date; kind: string }>(
    "SELECT id, to_address, subject, status, error, created_at, kind FROM emails WHERE invoice_id=$1 AND org_id=$2 ORDER BY created_at DESC",
    [invoiceId, ctx.orgId],
  );
}

export const INVOICE_REMINDER_TEMPLATE =
  "Bonjour,\n\nSauf erreur de notre part, la {type} n° {numero} d'un montant de {montant} TTC, échue le {echeance}, reste à régler à hauteur de {reste}.\n\nNous vous remercions de bien vouloir procéder au règlement. Si celui-ci a été effectué entre-temps, merci de ne pas tenir compte de ce message.\n\nCordialement,\n{entreprise}";

/**
 * Relances des factures échues : selon les délais choisis par l'entreprise
 * (par défaut 3, 15 puis 30 jours après l'échéance), une relance par palier.
 */
export async function runInvoiceReminders(db: Database, now = new Date()) {
  const today = parisDate(now);
  const orgs = await db.query<{ id: string; trade_name: string; invoice_reminder_settings: { enabled?: boolean; days?: number[] } }>(
    "SELECT id, trade_name, invoice_reminder_settings FROM organizations WHERE status='active' AND (invoice_reminder_settings->>'enabled')::boolean IS TRUE",
  );
  let sent = 0;
  for (const org of orgs) {
    const days = (org.invoice_reminder_settings.days ?? [3, 15, 30]).filter((d) => Number.isInteger(d) && d >= 0).sort((a, b) => a - b);
    const rows = await db.query<Record<string, unknown>>(
      "SELECT * FROM invoices WHERE org_id=$1 AND kind <> 'credit_note' AND due_date < $2 AND amount_due_cents > paid_cents + credited_cents",
      [org.id, today],
    );
    for (const r of rows) {
      const inv = mapInvoice(r);
      const step = days.at(inv.reminder_count);
      if (step === undefined) continue;
      if (parisDate(addDays(new Date(inv.due_date + "T12:00:00Z"), step)) > today) continue;
      const snap = r.snapshot as InvoiceSnapshot;
      const to = snap.customer.email;
      if (!to) continue;
      const body = renderTemplate(INVOICE_REMINDER_TEMPLATE, {
        type: kindName(inv.kind),
        numero: inv.number,
        montant: formatEuros(inv.amount_due_cents),
        echeance: frDate(inv.due_date),
        reste: formatEuros(inv.balance_cents),
        entreprise: org.trade_name,
      });
      const mail = await sendMail(db, {
        orgId: org.id,
        quoteId: inv.quote_id,
        kind: "invoice_reminder",
        to,
        subject: `Rappel : ${kindName(inv.kind)} ${inv.number} à régler`,
        body,
        attachmentInvoiceId: inv.id,
        invoiceId: inv.id,
        idempotencyKey: `invoice-reminder:${inv.id}:${inv.reminder_count + 1}`,
      });
      await db.query("UPDATE invoices SET reminder_count=reminder_count+1, last_reminder_at=now() WHERE id=$1", [inv.id]);
      if (mail.status === "sent") sent++;
    }
  }
  return { sent };
}

export async function saveInvoiceSettings(
  ctx: Ctx,
  input: {
    invoice_prefix?: string;
    credit_prefix?: string;
    invoice_due_days?: string | number;
    late_penalty_text?: string;
    reminders_enabled?: boolean;
    reminder_days?: string;
  },
) {
  requireWritable(ctx);
  const prefix = (v: string | undefined, label: string) => {
    if (v === undefined) return undefined;
    const t = v.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(t)) throw badRequest(`${label} : 1 à 8 lettres ou chiffres`);
    return t;
  };
  const due = input.invoice_due_days === undefined ? undefined : Number(input.invoice_due_days);
  if (due !== undefined && (!Number.isInteger(due) || due < 0 || due > 60))
    throw badRequest("Le délai de paiement est limité à 60 jours (article L441-10 du Code de commerce)");
  const days =
    input.reminder_days === undefined
      ? undefined
      : input.reminder_days
          .split(/[^\d]+/)
          .filter(Boolean)
          .map(Number)
          .slice(0, 6);
  const cur = await orgRow(ctx.db, ctx.orgId);
  const reminders = {
    enabled: input.reminders_enabled ?? Boolean(cur.invoice_reminder_settings?.enabled),
    days: days?.length ? days : (cur.invoice_reminder_settings?.days ?? [3, 15, 30]),
  };
  await ctx.db.query(
    `UPDATE organizations SET invoice_prefix=coalesce($2, invoice_prefix), credit_prefix=coalesce($3, credit_prefix),
       invoice_due_days=coalesce($4, invoice_due_days), late_penalty_text=coalesce($5, late_penalty_text), invoice_reminder_settings=$6, updated_at=now()
     WHERE id=$1`,
    [
      ctx.orgId,
      prefix(input.invoice_prefix, "Préfixe des factures") ?? null,
      prefix(input.credit_prefix, "Préfixe des avoirs") ?? null,
      due ?? null,
      input.late_penalty_text?.trim() ?? null,
      JSON.stringify(reminders),
    ],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "org.invoice_settings", ip: ctx.ip });
}

export function invoicePublicUrl(id: string) {
  return appUrl(`/app/factures/${id}`);
}
