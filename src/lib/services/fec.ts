/**
 * Fichier des écritures comptables (FEC, article A47 A-1 du Livre des procédures fiscales).
 *
 * Journal des ventes (VT) : une écriture par facture ou avoir.
 *   411 client       débit  du montant dû (net des acomptes déduits)
 *   706000 ventes    crédit du hors taxe des travaux (4191 pour une facture d'acompte)
 *   4457xx TVA       crédit de la TVA par taux, nette de celle déjà déclarée sur les acomptes
 *   4191 acomptes    débit du hors taxe des acomptes déduits sur la facture de solde
 * Un avoir passe les mêmes comptes en sens inverse.
 * Journal de banque (BQ) : un règlement = 512000 au débit, 411 client au crédit ; un remboursement de frais = 421 au débit.
 * Journal des notes de frais (NF) : charge HT et TVA déductible au débit, 421 salarié (ou banque, carte de l'entreprise) au crédit.
 */

import { centsToInput } from "@/lib/calc/format";
import { num } from "@/lib/db";
import { badRequest } from "@/lib/http";
import type { Ctx } from "./context";
import { audit } from "./context";
import type { InvoiceSnapshot } from "./invoices";
import { DEFAULT_PLAN, expenseAccount, getPlan, salesAccount, vatAccountOf, ventilate, type AccountingPlan } from "./accounting-plan";

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
  inv: {
    kind: string;
    number: string;
    customer_id: string | null;
    amount_due_cents: number;
    total_ht_cents: number;
    depositRelated: boolean;
  },
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
    lines.push({
      account,
      label,
      aux: withAux ? aux : undefined,
      debit: real > 0 ? real : 0,
      credit: real < 0 ? -real : 0,
    });
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
  const parts = groups.map((g) => ({
    bp: g.vatBp,
    cents: total ? Math.round((g.vatCents * deductedTtc) / total) : 0,
  }));
  return parts;
}

/** Écritures de la période : ventes, règlements, notes de frais et leurs remboursements. */
export async function accountingEntries(ctx: Ctx, from: string, to: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw badRequest("Période invalide");
  const org = (await ctx.db.query<{ siren: string }>("SELECT siren FROM organizations WHERE id=$1", [ctx.orgId]))[0];
  const plan = await getPlan(ctx);
  const invoices = await ctx.db.query<Record<string, unknown>>(
    `SELECT id, kind, number, customer_id, issue_date, amount_due_cents, total_ht_cents, snapshot, credited_invoice_id,
       (SELECT kind FROM invoices c WHERE c.id = i.credited_invoice_id) AS credited_kind
     FROM invoices i WHERE org_id=$1 AND issue_date BETWEEN $2 AND $3 ORDER BY issued_at`,
    [ctx.orgId, from, to],
  );
  const deposits = await ctx.db.query<{
    number: string;
    snapshot: InvoiceSnapshot;
  }>("SELECT number, snapshot FROM invoices WHERE org_id=$1 AND kind='deposit'", [ctx.orgId]);
  const depositSnap = new Map(deposits.map((d) => [d.number, d.snapshot]));
  const rows: Entry[] = [];
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
    for (const l of lines) rows.push(entry("VT", "Journal des ventes", `VT${String(seq).padStart(6, "0")}`, date, l, String(r.number), lib));
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
    rows.push(entry("BQ", "Banque", num_, date, { account: plan.bank, label: "Banque", debit: amount, credit: 0 }, String(p.number), lib));
    rows.push(
      entry(
        "BQ",
        "Banque",
        num_,
        date,
        {
          account: plan.customers,
          label: "Clients",
          aux,
          debit: 0,
          credit: amount,
        },
        String(p.number),
        lib,
      ),
    );
  }
  const expenses = await ctx.db.query<Record<string, unknown>>(
    `SELECT e.id, e.expense_date, e.merchant, e.category, e.amount_ttc_cents, e.vat_cents, e.payment, e.user_id, u.name AS user_name
     FROM expenses e JOIN users u ON u.id=e.user_id
     WHERE e.org_id=$1 AND e.status IN ('valide', 'rembourse') AND e.expense_date BETWEEN $2 AND $3 ORDER BY e.expense_date, e.created_at`,
    [ctx.orgId, from, to],
  );
  let nf = 0;
  for (const e of expenses) {
    nf++;
    const date = dateOf(e.expense_date);
    const ttc = num(e.amount_ttc_cents);
    const vat = num(e.vat_cents);
    const piece = `NF${String(e.id).replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const lib = `${EXPENSE_LABELS[String(e.category)] ?? "Frais"} ${clean(String(e.merchant ?? ""))}`.trim();
    const num_ = `NF${String(nf).padStart(6, "0")}`;
    const staff = staffAux(String(e.user_id), String(e.user_name ?? ""));
    const lines: Line[] = [
      {
        account: expenseAccount(plan, String(e.category)),
        label: "Frais",
        debit: ttc - vat,
        credit: 0,
      },
    ];
    if (vat)
      lines.push({
        account: plan.vatDeductible,
        label: "TVA déductible",
        debit: vat,
        credit: 0,
      });
    lines.push(
      e.payment === "perso"
        ? {
            account: plan.staff,
            label: "Personnel, notes de frais",
            aux: staff,
            debit: 0,
            credit: ttc,
          }
        : { account: plan.bank, label: "Banque", debit: 0, credit: ttc },
    );
    for (const l of lines) rows.push(entry("NF", "Notes de frais", num_, date, l, piece, lib));
  }
  const refunds = await ctx.db.query<Record<string, unknown>>(
    `SELECT e.id, e.reimbursed_at, e.amount_ttc_cents, e.merchant, e.user_id, u.name AS user_name
     FROM expenses e JOIN users u ON u.id=e.user_id
     WHERE e.org_id=$1 AND e.status='rembourse' AND e.payment='perso' AND e.reimbursed_at IS NOT NULL
       AND (e.reimbursed_at AT TIME ZONE 'Europe/Paris')::date BETWEEN $2 AND $3 ORDER BY e.reimbursed_at`,
    [ctx.orgId, from, to],
  );
  for (const e of refunds) {
    bq++;
    const date = dateOf(e.reimbursed_at);
    const amount = num(e.amount_ttc_cents);
    const piece = `NF${String(e.id).replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    const lib = `Remboursement frais ${clean(String(e.user_name ?? ""))}`.trim();
    const num_ = `BQ${String(bq).padStart(6, "0")}`;
    const staff = staffAux(String(e.user_id), String(e.user_name ?? ""));
    rows.push(
      entry(
        "BQ",
        "Banque",
        num_,
        date,
        {
          account: plan.staff,
          label: "Personnel, notes de frais",
          aux: staff,
          debit: amount,
          credit: 0,
        },
        piece,
        lib,
      ),
    );
    rows.push(entry("BQ", "Banque", num_, date, { account: plan.bank, label: "Banque", debit: 0, credit: amount }, piece, lib));
  }
  const siren = (org?.siren ?? "").replace(/\D/g, "") || "000000000";
  return { entries: rows, siren };
}

export interface Entry {
  journal: string;
  journalLib: string;
  num: string;
  /** AAAA-MM-JJ */
  date: string;
  line: Line;
  piece: string;
  lib: string;
}

function entry(journal: string, journalLib: string, num_: string, date: string, line: Line, piece: string, lib: string): Entry {
  return {
    journal,
    journalLib,
    num: num_,
    date,
    line,
    piece: clean(piece),
    lib: clean(lib).slice(0, 200),
  };
}

function dateOf(v: unknown) {
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

function staffAux(userId: string, name: string) {
  return {
    num: `S${userId.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    name: clean(name) || "Salarié",
  };
}

const EXPENSE_LABELS: Record<string, string> = {
  repas: "Repas",
  carburant: "Carburant",
  peage_parking: "Péage et stationnement",
  fournitures: "Petites fournitures",
  hebergement: "Hébergement",
  transport: "Transport",
  autre: "Frais",
};

export const ACCOUNTING_FORMATS = {
  fec: "Fichier des écritures comptables (FEC)",
  csv: "Tableur (CSV, point-virgule)",
} as const;
export type AccountingFormat = keyof typeof ACCOUNTING_FORMATS;

/** Ligne au format tableur français : séparateur point-virgule, virgule décimale, guillemets si besoin. */
function csvCell(v: string) {
  return /[;"\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v;
}

export const CSV_COLUMNS = ["Journal", "Date", "N° écriture", "Pièce", "Compte", "Compte auxiliaire", "Nom du tiers", "Libellé", "Débit", "Crédit"] as const;

/** Export des écritures, au format FEC officiel ou en tableur à importer dans Pennylane, Sage, Cegid, EBP ou QuickBooks. */
export async function buildAccountingExport(ctx: Ctx, from: string, to: string, format: string = "fec") {
  if (!(format in ACCOUNTING_FORMATS)) throw badRequest("Format d'export inconnu");
  const { entries, siren } = await accountingEntries(ctx, from, to);
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "export.fec",
    data: { from, to, rows: entries.length, format },
    ip: ctx.ip,
  });
  if (format === "csv") {
    const fr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
    const lines = entries.map((e) =>
      [
        e.journal,
        fr(e.date),
        e.num,
        e.piece,
        e.line.account,
        e.line.aux?.num ?? "",
        e.line.aux?.name ?? "",
        e.lib,
        centsToInput(e.line.debit),
        centsToInput(e.line.credit),
      ]
        .map(csvCell)
        .join(";"),
    );
    return {
      filename: `ecritures-${ymd(from)}-${ymd(to)}.csv`,
      contentType: "text/csv; charset=utf-8",
      content: "\uFEFF" + [CSV_COLUMNS.join(";"), ...lines].join("\r\n") + "\r\n",
      count: entries.length,
    };
  }
  const content = [FEC_COLUMNS.join("\t"), ...entries.map((e) => fecRow(e).join("\t"))].join("\r\n") + "\r\n";
  return {
    filename: `${siren}FEC${ymd(to)}.txt`,
    contentType: "text/plain; charset=utf-8",
    content,
    count: entries.length,
  };
}

export async function buildFec(ctx: Ctx, from: string, to: string) {
  return buildAccountingExport(ctx, from, to, "fec");
}

function fecRow(e: Entry): string[] {
  const { line: l, date } = e;
  return [
    e.journal,
    e.journalLib,
    e.num,
    ymd(date),
    l.account,
    l.label,
    l.aux?.num ?? "",
    l.aux?.name ?? "",
    e.piece,
    ymd(date),
    e.lib,
    centsToInput(l.debit),
    centsToInput(l.credit),
    "",
    "",
    ymd(date),
    "",
    "",
  ];
}
