import { beforeAll, describe, expect, it } from "vitest";
import { centsToInput } from "@/lib/calc/format";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import {
  clearInvoiceSchedule,
  createFinalInvoice,
  defaultInvoiceMessage,
  getInvoice,
  invoiceStatus,
  recordPayment,
  runInvoiceReminders,
  saveInvoiceSettings,
  setInvoiceSchedule,
} from "@/lib/services/invoices";
import { getDashboard } from "@/lib/services/dashboard";
import { getOrganization } from "@/lib/services/organization";
import { createQuote, getDraft, issueQuote, parisDate, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { addMonths, nextInstallment, scheduleState, splitSchedule } from "@/lib/services/schedule";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

async function finalInvoice() {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx, { email: "client@exemple.fr" }) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Cuisine",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Solde à réception de facture.",
      sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line({ quantity: "10", unitPrice: "100,01" })] }],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  return createFinalInvoice(ctx, id);
}

const days = (n: number) => new Date(Date.now() + n * 86400000);

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "echeancier@exemple.fr");
  await completeProfile(ctx);
});

describe("échéanciers de paiement", () => {
  it("répartit au centime près et garde le dernier jour des mois courts", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 3)).toBe("2027-02-15");
    const items = splitSchedule(100001, 3, "2026-01-31");
    expect(items.map((i) => i.amountCents)).toEqual([33335, 33333, 33333]);
    expect(items.map((i) => i.dueDate)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    const s = { base: 0, items };
    const state = scheduleState(s, 40000, "2026-03-01");
    expect(state.map((x) => x.status)).toEqual(["paid", "overdue", "due"]);
    expect(state[1].restCents).toBe(33333 - (40000 - 33335));
    expect(nextInstallment(s, 40000, "2026-03-01")).toMatchObject({ index: 1, overdue: true, restCents: state[1].restCents });
    expect(nextInstallment(s, 100001, "2026-06-01")).toBeNull();
  });

  it("établit un échéancier sur le reste à payer et juge le retard échéance par échéance", async () => {
    const inv = await finalInvoice();
    const before = await getInvoice(ctx, inv.id);
    await recordPayment(ctx, inv.id, { amount: "100", paidOn: parisDate(new Date()), method: "virement", reference: "" });
    const first = parisDate(days(10));
    await expect(setInvoiceSchedule(ctx, inv.id, { count: 1, firstDate: first })).rejects.toMatchObject({ status: 400 });
    await expect(setInvoiceSchedule(ctx, inv.id, { count: 3, firstDate: "2000-01-01" })).rejects.toMatchObject({ status: 400 });
    const s = await setInvoiceSchedule(ctx, inv.id, { count: 3, firstDate: first });
    expect(s.base).toBe(10000);
    expect(s.items.reduce((t, i) => t + i.amountCents, 0)).toBe(before.amount_due_cents - 10000);

    const now = await getInvoice(ctx, inv.id);
    expect(now.schedule?.items).toHaveLength(3);
    // La facture d'origine est inchangée ; seul le retard suit l'échéancier.
    expect(now.due_date).toBe(before.due_date);
    expect(invoiceStatus(now, parisDate(days(5)))).toBe("partial");
    expect(invoiceStatus(now, parisDate(days(12)))).toBe("overdue");

    const msg = defaultInvoiceMessage(now, await getOrganization(ctx));
    expect(msg.body).toContain("échéance 1");
    expect(msg.body).toContain("échéance 3");

    // Les encaissements prévus suivent les échéances, pas la date de la facture.
    const f = (await getDashboard(ctx)).forecast;
    expect([f.overdueCents, f.within30Cents, f.within60Cents, f.within90Cents]).toEqual([0, ...s.items.map((i) => i.amountCents)]);
  });

  it("relance chaque échéance non réglée selon ses propres paliers", async () => {
    // Entreprise distincte : les factures des autres tests ne doivent pas être relancées ici.
    ctx = await signUp(db, "relances-echeancier@exemple.fr");
    await completeProfile(ctx);
    const inv = await finalInvoice();
    await saveInvoiceSettings(ctx, { reminders_enabled: true, reminder_days: "3, 15" });
    const first = parisDate(days(10));
    const s = await setInvoiceSchedule(ctx, inv.id, { count: 3, firstDate: first });

    // Échéance pas encore passée : aucune relance, même si l'échéance de la facture l'est.
    expect((await runInvoiceReminders(db, days(5))).sent).toBe(0);
    expect((await runInvoiceReminders(db, days(14))).sent).toBe(1);
    expect((await runInvoiceReminders(db, days(14))).sent).toBe(0);
    let cur = await getInvoice(ctx, inv.id);
    expect(cur.schedule?.reminders).toEqual({ 0: 1 });

    // Première échéance réglée : la suivante a ses propres relances.
    await recordPayment(ctx, inv.id, {
      amount: centsToInput(s.items[0].amountCents),
      paidOn: parisDate(new Date()),
      method: "cheque",
      reference: "",
    });
    const second = new Date(addMonths(first, 1) + "T12:00:00Z");
    expect((await runInvoiceReminders(db, new Date(second.getTime() + 4 * 86400000))).sent).toBe(1);
    cur = await getInvoice(ctx, inv.id);
    expect(cur.schedule?.reminders).toEqual({ 0: 1, 1: 1 });
    expect(cur.reminder_count).toBe(2);

    await clearInvoiceSchedule(ctx, inv.id);
    expect((await getInvoice(ctx, inv.id)).schedule).toBeNull();
    await expect(clearInvoiceSchedule(ctx, inv.id)).rejects.toMatchObject({ status: 404 });
  });
});
