/**
 * Fichier des écritures comptables (FEC, article A47 A-1 du Livre des procédures fiscales).
 *
 * Journal des ventes (VT) : une écriture par facture ou avoir.
 *   411 client       débit  du montant dû (net des acomptes déduits)
 *   706000 ventes    crédit du hors taxe des travaux (4191 pour une facture d'acompte)
 *   4457xx TVA       crédit de la TVA par taux, nette de celle déjà déclarée sur les acomptes
 *   4191 acomptes    débit du hors taxe des acomptes déduits sur la facture de solde
 * Un avoir passe les mêmes comptes en sens inverse.
 * Journal de banque (BQ) : un règlement = 512000 au débit, 411 client au crédit.
 */

import { centsToInput } from "@/lib/calc/format";
import { num } from "@/lib/db";
import { badRequest } from "@/lib/http";
import type { Ctx } from "./context";
import { audit } from "./context";
import type { InvoiceSnapshot } from "./invoices";
import { DEFAULT_PLAN, getPlan, salesAccount, vatAccountOf, ventilate, type AccountingPlan } from "./accounting-plan";

export const FEC_COLUMNS = [
  "JournalCode",
  "JournalLib",
  "EcritureNum",
  "EcritureDate",
  "CompteNum",
  "CompteLib",
  "CompAuxNum",
  "CompAuxLib",
  "PieceRef",
  "PieceDate",
  "EcritureLib",
  "Debit",
  "Credit",
  "EcritureLet",
  "DateLet",
  "ValidDate",
  "Montantdevise",
  "Idevise",
] as const;

export function vatAccount(bp: number) {
  return vatAccountOf(DEFAULT_PLAN, bp);
}

interface Line {
  account: string;
  label: string;
  aux?: { num: string; name: string };
  debit: number;
  credit: number;
}

function ymd(iso: string) {
  return iso.slice(0, 10).replaceAll("-", "");
}

function clean(t: string) {
  return t.replace(/[\t\r\n|]+/g, " ").trim();
}

function auxOf(customerId: string | null, name: string, prefix = DEFAULT_PLAN.auxPrefix) {
  const code = (customerId ?? "").replaceAll("-", "").slice(0, 8).toUpperCase() || "DIVERS";
  return { num: `${prefix}${code}`, name: clean(name) || "Client" };
}

const ACCOUNT_LABELS: Record<string, string> = {
  sales: "Prestations de services",
  goods: "Ventes de fournitures",
  subcontracting: "Travaux sous-traités",
  travel: "Frais de déplacement refacturés",
};

/** Hors taxe de la facture par compte de vente, au prorata des lignes de chaque nature. */
function salesSplit(plan: AccountingPlan, snap: InvoiceSnapshot, totalHt: number): [string, string, number][] {
  if (!plan.ventilate) return [[plan.sales, ACCOUNT_LABELS.sales, totalHt]];
  const nets = new Map(snap.calc.sections.flatMap((s) => s.lines.filter((l) => !l.optional).map((l) => [l.id, l.netCents] as const)));
  const weights = new Map<string, number>();
  for (const s of snap.sections) {
    for (const l of s.lines) {
      const acc = salesAccount(plan, l.nature);
      weights.set(acc, (weights.get(acc) ?? 0) + (nets.get(l.id) ?? 0));
    }
  }
  const parts = ventilate(totalHt, weights);
  if (!parts.size) return [[plan.sales, ACCOUNT_LABELS.sales, totalHt]];
  const label = (acc: string) => ACCOUNT_LABELS[(["sales", "goods", "subcontracting", "travel"] as const).find((k) => plan[k] === acc) ?? "sales"];
  return [...parts.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([acc, cents]) => [acc, label(acc), cents]);
}

/** Écriture d'une facture ou d'un avoir, équilibrée au centime. */
export function invoiceLines(
  inv: { kind: string; number: string; customer_id: string | null; amount_due_cents: number; total_ht_cents: number; depositRelated: boolean },
  snap: InvoiceSnapshot,
  depositVatByNumber: Map<string, { bp: number; cents: number }[]>,
  plan: AccountingPlan = DEFAULT_PLAN,
): Line[] {
  const sign = inv.kind === "credit_note" ? -1 : 1;
  const aux = auxOf(inv.customer_id, snap.customer.name, plan.auxPrefix);
  const deposit = inv.depositRelated;
  const lines: Line[] = [];
  const put = (account: string, label: string, amount: number, side: "debit" | "credit", withAux = false) => {
    if (!amount) return;
    // Un montant négatif change de colonne : le FEC n'accepte que des montants positifs.
    const real = side === "debit" ? amount : -amount;
    lines.push({ account, label, aux: withAux ? aux : undefined, debit: real > 0 ? real : 0, credit: real < 0 ? -real : 0 });
  };
  put(plan.customers, "Clients", sign * inv.amount_due_cents, "debit", true);
  if (deposit) put(plan.deposits, "Clients - avances et acomptes reçus", sign * inv.total_ht_cents, "credit");
  else for (const [acc, label, cents] of salesSplit(plan, snap, inv.total_ht_cents)) put(acc, label, sign * cents, "credit");
  const vat = new Map<number, number>();
  for (const g of snap.calc.vatGroups) vat.set(g.vatBp, (vat.get(g.vatBp) ?? 0) + g.vatCents);
  let depositHt = 0;
  for (const d of snap.invoice.deductions) {
    depositHt += d.htCents;
    const parts = depositVatByNumber.get(d.number);
    if (parts?.length) {
      for (const p of parts) vat.set(p.bp, (vat.get(p.bp) ?? 0) - p.cents);
    } else {
      const main = snap.calc.vatGroups[0]?.vatBp ?? 2000;
      vat.set(main, (vat.get(main) ?? 0) - d.vatCents);
    }
  }
  for (const [bp, cents] of [...vat.entries()].sort((a, b) => b[0] - a[0])) {
    put(vatAccountOf(plan, bp), `TVA collectée ${(bp / 100).toString().replace(".", ",")} %`, sign * cents, "credit");
  }
  put(plan.deposits, "Clients - avances et acomptes reçus", sign * depositHt, "debit");
  return lines;
}

/** Ventilation de la TVA d'un acompte, au prorata de la part encore déduite. */
function depositVatParts(snap: InvoiceSnapshot, deductedTtc: number) {
  const total = snap.calc.totalTtcCents;
  const groups = snap.calc.vatGroups;
  const parts = groups.map((g) => ({ bp: g.vatBp, cents: total ? Math.round((g.vatCents * deductedTtc) / total) : 0 }));
  return parts;
}

export async function buildFec(ctx: Ctx, from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw badRequest("Période invalide");
  const org = (await ctx.db.query<{ siren: string }>("SELECT siren FROM organizations WHERE id=$1", [ctx.orgId]))[0];
  const plan = await getPlan(ctx);
  const invoices = await ctx.db.query<Record<string, unknown>>(
    `SELECT id, kind, number, customer_id, issue_date, amount_due_cents, total_ht_cents, snapshot, credited_invoice_id,
       (SELECT kind FROM invoices c WHERE c.id = i.credited_invoice_id) AS credited_kind
     FROM invoices i WHERE org_id=$1 AND issue_date BETWEEN $2 AND $3 ORDER BY issued_at`,
    [ctx.orgId, from, to],
  );
  const deposits = await ctx.db.query<{ number: string; snapshot: InvoiceSnapshot }>(
    "SELECT number, snapshot FROM invoices WHERE org_id=$1 AND kind='deposit'",
    [ctx.orgId],
  );
  const depositSnap = new Map(deposits.map((d) => [d.number, d.snapshot]));
  const rows: string[][] = [];
  let seq = 0;
  for (const r of invoices) {
    const snap = r.snapshot as InvoiceSnapshot;
    // Un acompte (et l'avoir qui l'annule) passe en compte d'acomptes reçus, pas en chiffre d'affaires.
    const depositRelated = r.kind === "deposit" || (r.kind === "credit_note" && r.credited_kind === "deposit");
    const map = new Map<string, { bp: number; cents: number }[]>();
    for (const d of snap.invoice.deductions) {
      const ds = depositSnap.get(d.number);
      if (ds) map.set(d.number, depositVatParts(ds, d.ttcCents));
    }
    const date = String(r.issue_date instanceof Date ? r.issue_date.toISOString() : r.issue_date).slice(0, 10);
    const lines = invoiceLines(
      {
        kind: String(r.kind),
        number: String(r.number),
        customer_id: (r.customer_id as string | null) ?? null,
        amount_due_cents: num(r.amount_due_cents),
        total_ht_cents: num(r.total_ht_cents),
        depositRelated,
      },
      snap,
      map,
      plan,
    );
    seq++;
    const lib = `${r.kind === "credit_note" ? "Avoir" : r.kind === "deposit" ? "Acompte" : r.kind === "progress" ? "Situation" : "Facture"} ${r.number} ${snap.customer.name}`;
    for (const l of lines) rows.push(fecRow("VT", "Journal des ventes", `VT${String(seq).padStart(6, "0")}`, date, l, String(r.number), lib));
  }
  const payments = await ctx.db.query<Record<string, unknown>>(
    `SELECT p.amount_cents, p.paid_on, p.method, p.reference, i.number, i.customer_id, i.snapshot->'customer'->>'name' AS customer_name
     FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id
     WHERE p.org_id=$1 AND p.canceled_at IS NULL AND p.paid_on BETWEEN $2 AND $3 ORDER BY p.paid_on, p.created_at`,
    [ctx.orgId, from, to],
  );
  let bq = 0;
  for (const p of payments) {
    bq++;
    const date = String(p.paid_on instanceof Date ? p.paid_on.toISOString() : p.paid_on).slice(0, 10);
    const amount = num(p.amount_cents);
    const aux = auxOf((p.customer_id as string | null) ?? null, String(p.customer_name ?? ""), plan.auxPrefix);
    const lib = `Règlement ${p.number}${p.reference ? " " + clean(String(p.reference)) : ""}`;
    const num_ = `BQ${String(bq).padStart(6, "0")}`;
    rows.push(fecRow("BQ", "Banque", num_, date, { account: plan.bank, label: "Banque", debit: amount, credit: 0 }, String(p.number), lib));
    rows.push(
      fecRow("BQ", "Banque", num_, date, { account: plan.customers, label: "Clients", aux, debit: 0, credit: amount }, String(p.number), lib),
    );
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "export.fec", data: { from, to, rows: rows.length }, ip: ctx.ip });
  const content = [FEC_COLUMNS.join("\t"), ...rows.map((r) => r.join("\t"))].join("\r\n") + "\r\n";
  const siren = (org?.siren ?? "").replace(/\D/g, "") || "000000000";
  return { filename: `${siren}FEC${ymd(to)}.txt`, content, count: rows.length };
}

function fecRow(journal: string, journalLib: string, num_: string, date: string, l: Line, piece: string, lib: string): string[] {
  return [
    journal,
    journalLib,
    num_,
    ymd(date),
    l.account,
    l.label,
    l.aux?.num ?? "",
    l.aux?.name ?? "",
    clean(piece),
    ymd(date),
    clean(lib).slice(0, 200),
    centsToInput(l.debit),
    centsToInput(l.credit),
    "",
    "",
    ymd(date),
    "",
    "",
  ];
}
