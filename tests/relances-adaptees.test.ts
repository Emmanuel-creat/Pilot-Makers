import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { adaptedSteps, payerProfile, reminderTone } from "@/lib/services/dunning";
import { createFinalInvoice, customerPaymentProfile, recordPayment, runInvoiceReminders, saveInvoiceSettings } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, parisDate, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

async function invoiceFor(customerId: string, unitPrice = "45") {
  const id = await createQuote(ctx, { customerId });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Travaux",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Solde à réception de facture.",
      sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line({ unitPrice })] }],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  return createFinalInvoice(ctx, id);
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "relances@exemple.fr");
  await completeProfile(ctx);
});

describe("relances adaptées au montant et au client", () => {
  it("classe les clients selon leurs retards passés", () => {
    expect(payerProfile([]).profile).toBe("new");
    expect(payerProfile([-2, 0, 3])).toEqual({ profile: "reliable", averageDelay: 1, invoices: 3 });
    expect(payerProfile([0, 20]).profile).toBe("usual");
    expect(payerProfile([12, 25, 30]).profile).toBe("late");
  });

  it("ajuste les paliers au montant et au profil, sans deux relances le même jour", () => {
    const days = [3, 15, 30];
    expect(adaptedSteps(days, 100000, "new")).toEqual([3, 15, 30]);
    expect(adaptedSteps(days, 100000, "reliable")).toEqual([7, 15, 30]);
    expect(adaptedSteps(days, 600000, "new")).toEqual([2, 9, 18]);
    expect(adaptedSteps(days, 600000, "late")).toEqual([1, 5, 9]);
    expect(adaptedSteps(days, 15000, "usual")).toEqual([3, 15]);
    expect(adaptedSteps([1, 2], 600000, "late")).toEqual([0, 1]);
    expect(reminderTone(0, 3, "new")).toBe("courtois");
    expect(reminderTone(0, 3, "late")).toBe("ferme");
    expect(reminderTone(2, 3, "reliable")).toBe("dernier");
  });

  it("relance plus tard un client qui paie à l'heure, avec un ton qui monte", async () => {
    const customer = await makeCustomer(ctx, { email: "fidele@exemple.fr" });
    // Historique : une facture réglée à l'échéance.
    const first = await invoiceFor(customer);
    await recordPayment(ctx, first.id, { amount: "990", paidOn: parisDate(new Date()), method: "virement", reference: "" });
    expect((await customerPaymentProfile(ctx, customer)).profile).toBe("reliable");

    const inv = await invoiceFor(customer);
    await saveInvoiceSettings(ctx, { reminders_enabled: true, reminder_days: "3, 15" });
    const due = (await db.query<{ due_date: Date | string }>("SELECT due_date FROM invoices WHERE id=$1", [inv.id]))[0].due_date;
    const dueMs = new Date(String(due instanceof Date ? due.toISOString().slice(0, 10) : due) + "T12:00:00Z").getTime();
    const day = (n: number) => new Date(dueMs + n * 86400000);
    // Bon payeur : pas de relance à J+5, première relance à J+7.
    expect((await runInvoiceReminders(db, day(5))).sent).toBe(0);
    expect((await runInvoiceReminders(db, day(7))).sent).toBe(1);
    expect((await runInvoiceReminders(db, day(15))).sent).toBe(1);
    const mails = await db.query<{ subject: string; body: string }>("SELECT subject, body FROM emails WHERE invoice_id=$1 ORDER BY created_at", [
      inv.id,
    ]);
    expect(mails[0].body).toContain("simple oubli");
    expect(mails[1].subject).toContain("Dernier rappel");
    expect(mails[1].body).toContain("pénalités de retard");
  });

  it("garde le rythme fixe quand l'adaptation est désactivée", async () => {
    await saveInvoiceSettings(ctx, { reminders_adaptive: false });
    const row = await db.query<{ s: { adaptive: boolean; days: number[] } }>("SELECT invoice_reminder_settings AS s FROM organizations WHERE id=$1", [
      ctx.orgId,
    ]);
    expect(row[0].s).toMatchObject({ adaptive: false, days: [3, 15] });
  });
});
