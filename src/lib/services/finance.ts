/**
 * Pilotage financier : déclaration de TVA préparée et trésorerie prévisionnelle à 3 mois.
 *
 * TVA : les travaux sont des prestations de services, la TVA est donc exigible à l'encaissement.
 * La TVA collectée d'une période est celle des règlements reçus, ventilée par taux au prorata de la
 * facture réglée. La TVA déductible reprend les notes de frais validées de la période.
 * Le résultat prépare la déclaration ; il ne la remplace pas et doit être vérifié avec le comptable.
 *
 * Trésorerie : solde saisi par l'entreprise, encaissements attendus (factures ouvertes à leur échéance,
 * devis signés restant à facturer), décaissements connus (TVA du mois précédent, frais avancés à
 * rembourser, charges fixes mensuelles saisies).
 */

import { z } from "zod";
import { parseScaled } from "@/lib/calc/decimal";
import { num } from "@/lib/db";
import { badRequest } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import type { InvoiceSnapshot } from "./invoices";
import { parisDate } from "./quotes";

export interface VatRate {
  vatBp: number;
  baseCents: number;
  vatCents: number;
}

export interface VatReturn {
  from: string;
  to: string;
  franchise: boolean;
  /** Encaissements de la période, TTC */
  receivedCents: number;
  payments: number;
  /** TVA collectée par taux (bases hors taxe encaissées) */
  collected: VatRate[];
  /** Encaissements sans TVA : autoliquidation en sous-traitance, opérations exonérées */
  untaxedCents: number;
  collectedCents: number;
  /** TVA des notes de frais validées */
  deductibleCents: number;
  expenses: number;
  /** Positif : TVA à payer ; négatif : crédit de TVA */
  netCents: number;
}

const isoDate = /^\d{4}-\d{2}-\d{2}$/;

/** Part d'un règlement par taux : TTC du taux rapporté au TTC de la facture, au centime près. */
export function splitPayment(amountCents: number, groups: VatRate[]): { vatBp: number; baseCents: number; vatCents: number }[] {
  const ttc = groups.reduce((s, g) => s + g.baseCents + g.vatCents, 0);
  if (!ttc) return [{ vatBp: 0, baseCents: amountCents, vatCents: 0 }];
  let left = amountCents;
  return groups.map((g, i) => {
    const part = i === groups.length - 1 ? left : Math.round((amountCents * (g.baseCents + g.vatCents)) / ttc);
    left -= part;
    const gTtc = g.baseCents + g.vatCents;
    const vat = gTtc ? Math.round((part * g.vatCents) / gTtc) : 0;
    return { vatBp: g.vatBp, baseCents: part - vat, vatCents: vat };
  });
}

export async function vatReturn(ctx: Ctx, from: string, to: string): Promise<VatReturn> {
  requirePermission(ctx, "billing");
  if (!isoDate.test(from) || !isoDate.test(to) || from > to) throw badRequest("Période invalide");
  const org = (await ctx.db.query<{ vat_regime: string }>("SELECT vat_regime FROM organizations WHERE id=$1", [ctx.orgId]))[0];
  const rows = await ctx.db.query<{ amount_cents: unknown; snapshot: InvoiceSnapshot }>(
    `SELECT p.amount_cents, i.snapshot FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
     WHERE p.org_id=$1 AND p.canceled_at IS NULL AND p.paid_on BETWEEN $2 AND $3 AND i.kind <> 'credit_note'`,
    [ctx.orgId, from, to],
  );
  const rates = new Map<number, VatRate>();
  let received = 0;
  let untaxed = 0;
  for (const r of rows) {
    const amount = num(r.amount_cents);
    received += amount;
    for (const part of splitPayment(amount, r.snapshot.calc.vatGroups)) {
      if (!part.vatCents) {
        untaxed += part.baseCents;
        continue;
      }
      const g = rates.get(part.vatBp) ?? { vatBp: part.vatBp, baseCents: 0, vatCents: 0 };
      g.baseCents += part.baseCents;
      g.vatCents += part.vatCents;
      rates.set(part.vatBp, g);
    }
  }
  const exp = await ctx.db.query<{ vat: unknown; n: unknown }>(
    `SELECT COALESCE(sum(vat_cents),0) AS vat, count(*) AS n FROM expenses
     WHERE org_id=$1 AND status IN ('valide','rembourse') AND expense_date BETWEEN $2 AND $3`,
    [ctx.orgId, from, to],
  );
  const collected = [...rates.values()].sort((a, b) => b.vatBp - a.vatBp);
  const collectedCents = collected.reduce((s, g) => s + g.vatCents, 0);
  const deductibleCents = num(exp[0]?.vat);
  return {
    from,
    to,
    franchise: org?.vat_regime === "franchise",
    receivedCents: received,
    payments: rows.length,
    collected,
    untaxedCents: untaxed,
    collectedCents,
    deductibleCents,
    expenses: num(exp[0]?.n),
    netCents: collectedCents - deductibleCents,
  };
}

/** Premier et dernier jour d'un mois AAAA-MM. */
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function nextMonth(month: string, n = 1) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function vatReturnCsv(v: VatReturn): string {
  const e = (c: number) => (c / 100).toFixed(2).replace(".", ",");
  const rows = [["Rubrique", "Taux", "Base HT", "TVA"]];
  for (const g of v.collected) rows.push(["TVA collectée", `${(g.vatBp / 100).toString().replace(".", ",")} %`, e(g.baseCents), e(g.vatCents)]);
  if (v.untaxedCents) rows.push(["Encaissements sans TVA (autoliquidation, exonération)", "", e(v.untaxedCents), "0,00"]);
  rows.push(["Total TVA collectée", "", "", e(v.collectedCents)]);
  rows.push(["TVA déductible sur notes de frais", "", "", e(v.deductibleCents)]);
  rows.push([v.netCents >= 0 ? "TVA nette à payer" : "Crédit de TVA", "", "", e(Math.abs(v.netCents))]);
  return "﻿" + rows.map((r) => r.map((c) => (/[;"\n]/.test(c) ? `"${c.replaceAll('"', '""')}"` : c)).join(";")).join("\r\n") + "\r\n";
}

/* ------------------------------------------------------------------ */
/* Trésorerie prévisionnelle                                           */
/* ------------------------------------------------------------------ */

export interface TreasurySettings {
  /** Solde bancaire saisi, en centimes */
  balanceCents: number;
  /** Date du solde (AAAA-MM-JJ) */
  balanceDate: string;
  /** Charges fixes mensuelles (loyer, salaires, crédits), en centimes */
  monthlyChargesCents: number;
}

export interface TreasuryMonth {
  month: string;
  /** Factures émises arrivant à échéance (les retards sont comptés sur le premier mois) */
  invoicesCents: number;
  /** Devis signés restant à facturer, encaissement estimé */
  toInvoiceCents: number;
  vatCents: number;
  expensesCents: number;
  chargesCents: number;
  netCents: number;
  /** Solde estimé en fin de mois */
  closingCents: number;
}

export interface TreasuryForecast {
  settings: TreasurySettings;
  overdueCents: number;
  overdueCount: number;
  months: TreasuryMonth[];
  /** Premier mois où le solde estimé devient négatif */
  shortfall: string | null;
}

export function readTreasury(raw: unknown): TreasurySettings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    balanceCents: Number.isSafeInteger(o.balanceCents) ? (o.balanceCents as number) : 0,
    balanceDate: typeof o.balanceDate === "string" && isoDate.test(o.balanceDate) ? o.balanceDate : "",
    monthlyChargesCents: Number.isSafeInteger(o.monthlyChargesCents) ? Math.max(0, o.monthlyChargesCents as number) : 0,
  };
}

const money = (label: string, allowNegative: boolean) =>
  z
    .string()
    .trim()
    .max(16)
    .transform((v, c) => {
      if (!v) return 0;
      try {
        const cents = Number(parseScaled(v, 2));
        if (!allowNegative && cents < 0) throw new Error();
        return cents;
      } catch {
        c.addIssue({ code: "custom", message: `${label} illisible` });
        return z.NEVER;
      }
    });

const treasurySchema = z.object({ balance: money("Solde", true), monthlyCharges: money("Charges mensuelles", false) });

export async function saveTreasury(ctx: Ctx, raw: unknown, now = new Date()) {
  requirePermission(ctx, "billing");
  requireWritable(ctx);
  const p = treasurySchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message, p.error.issues);
  const settings: TreasurySettings = { balanceCents: p.data.balance, balanceDate: parisDate(now), monthlyChargesCents: p.data.monthlyCharges };
  await ctx.db.query("UPDATE organizations SET treasury=$2 WHERE id=$1", [ctx.orgId, JSON.stringify(settings)]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "org.treasury", target: ctx.orgId, ip: ctx.ip });
  return settings;
}

export async function treasuryForecast(ctx: Ctx, now = new Date()): Promise<TreasuryForecast> {
  requirePermission(ctx, "billing");
  const today = parisDate(now);
  const first = today.slice(0, 7);
  const months = [first, nextMonth(first), nextMonth(first, 2)];
  const org = (
    await ctx.db.query<{ treasury: unknown; vat_regime: string }>("SELECT treasury, vat_regime FROM organizations WHERE id=$1", [ctx.orgId])
  )[0];
  const settings = readTreasury(org?.treasury);
  const rows: TreasuryMonth[] = months.map((month) => ({
    month,
    invoicesCents: 0,
    toInvoiceCents: 0,
    vatCents: 0,
    expensesCents: 0,
    chargesCents: settings.monthlyChargesCents,
    netCents: 0,
    closingCents: 0,
  }));
  const at = (month: string) => rows.find((r) => r.month === month);
  // Part de TVA des encaissements attendus, reversée le mois suivant.
  const vatShare = new Map<string, number>();
  const addVat = (month: string, cents: number) => vatShare.set(month, (vatShare.get(month) ?? 0) + cents);

  const open = await ctx.db.query<{ due_date: unknown; left: unknown; snapshot: InvoiceSnapshot }>(
    `SELECT due_date, amount_due_cents - paid_cents - credited_cents AS left, snapshot FROM invoices
     WHERE org_id=$1 AND kind <> 'credit_note' AND amount_due_cents - paid_cents - credited_cents > 0`,
    [ctx.orgId],
  );
  let overdueCents = 0;
  let overdueCount = 0;
  for (const r of open) {
    const due = r.due_date instanceof Date ? r.due_date.toISOString().slice(0, 10) : String(r.due_date).slice(0, 10);
    const left = num(r.left);
    if (due < today) {
      overdueCents += left;
      overdueCount++;
    }
    const month = due < today ? first : due.slice(0, 7);
    const row = at(month);
    if (!row) continue;
    row.invoicesCents += left;
    addVat(
      month,
      splitPayment(left, r.snapshot.calc.vatGroups).reduce((s, p) => s + p.vatCents, 0),
    );
  }

  // Devis signés pas encore entièrement facturés : encaissement estimé le mois suivant.
  const signed = await ctx.db.query<{ ttc: unknown; invoiced: unknown; vat: unknown }>(
    `SELECT q.total_ttc_cents AS ttc,
       COALESCE((SELECT sum(CASE WHEN i.kind='credit_note' THEN -i.total_ttc_cents ELSE i.total_ttc_cents END) FROM invoices i WHERE i.quote_id=q.id), 0) AS invoiced,
       q.total_ttc_cents - q.total_ht_cents AS vat
     FROM quotes q WHERE q.org_id=$1 AND q.status='accepted'`,
    [ctx.orgId],
  );
  const later = months[1];
  for (const r of signed) {
    const left = num(r.ttc) - num(r.invoiced);
    if (left <= 0) continue;
    at(later)!.toInvoiceCents += left;
    const ttc = num(r.ttc);
    addVat(later, ttc ? Math.round((left * num(r.vat)) / ttc) : 0);
  }

  if (org?.vat_regime !== "franchise") {
    const last = nextMonth(first, -1);
    const prev = monthBounds(last);
    const previous = await vatReturn(ctx, prev.from, prev.to);
    rows[0].vatCents = Math.max(0, previous.netCents);
    rows[1].vatCents = vatShare.get(first) ?? 0;
    rows[2].vatCents = vatShare.get(months[1]) ?? 0;
  }

  const exp = await ctx.db.query<{ total: unknown }>(
    "SELECT COALESCE(sum(amount_ttc_cents),0) AS total FROM expenses WHERE org_id=$1 AND status='valide' AND payment='perso'",
    [ctx.orgId],
  );
  rows[0].expensesCents = num(exp[0]?.total);

  let balance = settings.balanceCents;
  let shortfall: string | null = null;
  for (const r of rows) {
    r.netCents = r.invoicesCents + r.toInvoiceCents - r.vatCents - r.expensesCents - r.chargesCents;
    balance += r.netCents;
    r.closingCents = balance;
    if (balance < 0 && !shortfall) shortfall = r.month;
  }
  return { settings, overdueCents, overdueCount, months: rows, shortfall };
}
