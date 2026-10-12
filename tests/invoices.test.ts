import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import {
  cancelPayment,
  createCreditNote,
  createDepositInvoice,
  createFinalInvoice,
  getInvoice,
  getInvoicePdf,
  invoiceStatus,
  listInvoices,
  recordPayment,
  runInvoiceReminders,
  saveInvoiceSettings,
  sendInvoice,
} from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { sha256 } from "@/lib/security";
import { buildFec, FEC_COLUMNS } from "@/lib/services/fec";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let other: Ctx;

/** Devis accepté : 20 m² à 45 € (TVA 10 %) et un meuble à 500 € (TVA 20 %). */
async function acceptedQuote(c: Ctx = ctx) {
  const id = await createQuote(c, { customerId: await makeCustomer(c, { email: "client@exemple.fr" }) });
  const d = await getDraft(c, id);
  await saveDraft(
    c,
    id,
    {
      ...d,
      title: "Salle de bain",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Acompte de 30 % à la commande, solde à réception de facture.",
      sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line(), line({ label: "Meuble vasque", quantity: "1", unit: "u", unitPrice: "500", vatPercent: "20" })] }],
    },
    d.draftRevision,
  );
  await issueQuote(c, id);
  await recordResponseManually(c, id, { decision: "accept", version: 1, proof: "Devis signé reçu par courrier" });
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "factures@exemple.fr");
  await completeProfile(ctx);
  other = await signUp(db, "autre-factures@exemple.fr", "Autre");
});

describe("factures", () => {
  it("refuse de facturer un devis non accepté", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    await expect(createDepositInvoice(ctx, id, { percent: "30" })).rejects.toMatchObject({ status: 409 });
    await expect(createFinalInvoice(ctx, id)).rejects.toMatchObject({ status: 409 });
  });

  it("émet un acompte ventilé par taux, puis le solde qui le déduit", async () => {
    const quoteId = await acceptedQuote();
    // Travaux : 900 € HT à 10 % (990 TTC) et 500 € HT à 20 % (600 TTC), soit 1 590 € TTC.
    const dep = await createDepositInvoice(ctx, quoteId, { percent: "30" });
    expect(dep.number).toMatch(/^FA-\d{4}-0001$/);
    const d = await getInvoice(ctx, dep.id);
    expect(d.kind).toBe("deposit");
    expect(d.total_ht_cents).toBe(27000 + 15000);
    expect(d.total_ttc_cents).toBe(29700 + 18000);
    expect(d.snapshot.calc.vatGroups.map((g) => g.vatBp).sort()).toEqual([1000, 2000]);
    expect(d.due_date).toBe(d.issue_date);
    expect(d.status).toBe("issued");

    await expect(createDepositInvoice(ctx, quoteId, { percent: "80" })).rejects.toMatchObject({ status: 400 });

    const fin = await createFinalInvoice(ctx, quoteId);
    expect(fin.number).toMatch(/-0002$/);
    const f = await getInvoice(ctx, fin.id);
    expect(f.total_ttc_cents).toBe(159000);
    expect(f.amount_due_cents).toBe(159000 - 47700);
    expect(f.snapshot.invoice.deductions).toEqual([expect.objectContaining({ number: dep.number, ttcCents: 47700, vatCents: 2700 + 3000 })]);
    expect(f.snapshot.mentions.join(" ")).toContain("Pas d'escompte");
    await expect(createFinalInvoice(ctx, quoteId)).rejects.toMatchObject({ status: 409 });
    await expect(createDepositInvoice(ctx, quoteId, { percent: "10" })).rejects.toMatchObject({ status: 409 });

    const pdf = await getInvoicePdf(ctx, fin.id);
    expect(sha256(pdf.pdf)).toBe(f.pdf_sha256);
    expect(Buffer.from(pdf.pdf).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("suit les paiements, refuse le trop-perçu et annule un paiement", async () => {
    const quoteId = await acceptedQuote();
    const fin = await createFinalInvoice(ctx, quoteId);
    await expect(recordPayment(ctx, fin.id, { amount: "2000", paidOn: "2026-01-05", method: "virement" })).rejects.toMatchObject({ status: 400 });
    const p1 = await recordPayment(ctx, fin.id, { amount: "1000", paidOn: "2026-01-05", method: "cheque", reference: "Chèque 123" });
    expect((await getInvoice(ctx, fin.id)).status).toBe("partial");
    await recordPayment(ctx, fin.id, { amount: "590", paidOn: "2026-01-06", method: "virement" });
    expect((await getInvoice(ctx, fin.id)).status).toBe("paid");
    await cancelPayment(ctx, p1);
    const after = await getInvoice(ctx, fin.id);
    expect(after.paid_cents).toBe(59000);
    expect(after.balance_cents).toBe(100000);
    await expect(recordPayment(other, fin.id, { amount: "1", paidOn: "2026-01-05", method: "virement" })).rejects.toMatchObject({ status: 404 });
  });

  it("annule par avoir total ou partiel, sans jamais modifier la facture", async () => {
    const quoteId = await acceptedQuote();
    const fin = await createFinalInvoice(ctx, quoteId);
    const before = await getInvoice(ctx, fin.id);
    const partial = await createCreditNote(ctx, fin.id, { mode: "partial", label: "Geste commercial", amountHt: "100", vatPercent: "10" });
    expect(partial.number).toMatch(/^AV-\d{4}-\d{4}$/);
    const inv = await getInvoice(ctx, fin.id);
    expect(inv.credited_cents).toBe(11000);
    expect(inv.balance_cents).toBe(159000 - 11000);
    expect(inv.pdf_sha256).toBe(before.pdf_sha256);
    await expect(createCreditNote(ctx, fin.id, { mode: "full" })).rejects.toMatchObject({ status: 409 });
    await expect(createCreditNote(ctx, fin.id, { mode: "partial", label: "Trop", amountHt: "5000", vatPercent: "20" })).rejects.toMatchObject({ status: 400 });
    await expect(createCreditNote(ctx, partial.id, { mode: "full" })).rejects.toMatchObject({ status: 400 });

    const quote2 = await acceptedQuote();
    const dep = await createDepositInvoice(ctx, quote2, { percent: "30" });
    await createCreditNote(ctx, dep.id, { mode: "full", reason: "Erreur de pourcentage" });
    expect((await getInvoice(ctx, dep.id)).status).toBe("canceled");
    // Un acompte annulé n'est plus déduit du solde.
    const fin2 = await getInvoice(ctx, (await createFinalInvoice(ctx, quote2)).id);
    expect(fin2.amount_due_cents).toBe(159000);
  });

  it("envoie la facture et relance une facture échue une fois par palier", async () => {
    const quoteId = await acceptedQuote();
    const dep = await createDepositInvoice(ctx, quoteId, { percent: "10" });
    const sent = await sendInvoice(ctx, dep.id, { to: "client@exemple.fr", subject: "Facture", body: "Bonjour" });
    expect(sent.status).toBe("sent");
    expect((await getInvoice(ctx, dep.id)).sent_at).not.toBeNull();

    await saveInvoiceSettings(ctx, { reminders_enabled: true, reminder_days: "3, 15" });
    const in5days = new Date(Date.now() + 5 * 86400000);
    const r1 = await runInvoiceReminders(db, in5days);
    expect(r1.sent).toBeGreaterThanOrEqual(1);
    const again = await runInvoiceReminders(db, in5days);
    expect(again.sent).toBe(0);
    expect((await getInvoice(ctx, dep.id)).reminder_count).toBe(1);
  });

  it("numérote sans trou et isole les entreprises", async () => {
    const list = await listInvoices(ctx);
    const numbers = list.filter((i) => i.kind !== "credit_note").map((i) => Number(i.number.slice(-4))).sort((a, b) => a - b);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(await listInvoices(other)).toEqual([]);
    await expect(getInvoice(other, list[0].id)).rejects.toMatchObject({ status: 404 });
  });

  it("calcule le statut selon l'échéance", () => {
    const base = { kind: "final", amount_due_cents: 100, paid_cents: 0, credited_cents: 0, due_date: "2026-01-10" };
    expect(invoiceStatus(base, "2026-01-10")).toBe("issued");
    expect(invoiceStatus(base, "2026-01-11")).toBe("overdue");
    expect(invoiceStatus({ ...base, paid_cents: 100 }, "2026-02-01")).toBe("paid");
    expect(invoiceStatus({ ...base, credited_cents: 100 }, "2026-02-01")).toBe("canceled");
  });

  it("produit un FEC équilibré écriture par écriture", async () => {
    const quoteId = await acceptedQuote();
    const dep = await createDepositInvoice(ctx, quoteId, { percent: "30" });
    const fin = await createFinalInvoice(ctx, quoteId);
    await recordPayment(ctx, dep.id, { amount: "477", paidOn: new Date().toISOString().slice(0, 10), method: "virement" });
    await createCreditNote(ctx, fin.id, { mode: "full", reason: "Test" });
    const year = new Date().getFullYear();
    const fec = await buildFec(ctx, `${year - 1}-01-01`, `${year + 1}-12-31`);
    const [head, ...rows] = fec.content.split("\r\n").filter(Boolean).map((l) => l.split("\t"));
    expect(head).toEqual([...FEC_COLUMNS]);
    expect(rows.every((r) => r.length === 18)).toBe(true);
    const byEntry = new Map<string, number>();
    const cents = (v: string) => Math.round(Number(v.replace(",", ".")) * 100);
    for (const r of rows) byEntry.set(r[2], (byEntry.get(r[2]) ?? 0) + cents(r[11]) - cents(r[12]));
    const unbalanced = [...byEntry.entries()].filter(([, v]) => v !== 0);
    expect(unbalanced).toEqual([]);
    // Acompte en 4191, solde en 706 avec reprise de l'acompte.
    const depRows = rows.filter((r) => r[8] === dep.number && r[0] === "VT");
    expect(depRows.map((r) => r[4])).toContain("419100");
    expect(depRows.map((r) => r[4])).not.toContain("706000");
    const finRows = rows.filter((r) => r[8] === fin.number && r[0] === "VT");
    expect(finRows.find((r) => r[4] === "419100")?.[11]).toBe("420,00");
    expect(rows.some((r) => r[0] === "BQ" && r[4] === "512000" && r[11] === "477,00")).toBe(true);
    expect(fec.filename).toMatch(/^\d{9}FEC\d{8}\.txt$/);
  });
});
