import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { getCustomer } from "@/lib/services/customers";
import { createDepositInvoice, customerBalance, listInvoices, recordPayment } from "@/lib/services/invoices";
import { convertLeadToQuote, createLead, getLead, leadsDue, listLeads, updateLead } from "@/lib/services/leads";
import { getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let other: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "demandes@exemple.fr");
  await completeProfile(ctx);
  other = await signUp(db, "autre-demandes@exemple.fr", "Autre");
});

describe("demandes entrantes", () => {
  it("enregistre une demande, la suit puis la transforme en client et en devis", async () => {
    await expect(createLead(ctx, { name: "Jean Martin" })).rejects.toMatchObject({ status: 400 });
    const id = await createLead(ctx, {
      name: "Jean Martin",
      phone: "06 12 34 56 78",
      city: "Villeurbanne",
      description: "Rénovation de salle de bain. Douche à l'italienne, 6 m².",
      source: "recommandation",
      next_action: "Rappeler pour fixer une visite",
      next_action_on: "2020-01-01",
    });
    expect(await leadsDue(ctx)).toBe(1);
    await updateLead(ctx, id, { status: "visite", next_action: "Visite sur place", next_action_on: "2099-01-01" });
    expect(await leadsDue(ctx)).toBe(0);
    expect((await getLead(ctx, id)).status).toBe("visite");

    const quoteId = await convertLeadToQuote(ctx, id);
    expect(await convertLeadToQuote(ctx, id)).toBe(quoteId);
    const lead = await getLead(ctx, id);
    expect(lead.status).toBe("devis");
    const draft = await getDraft(ctx, quoteId);
    expect(draft.title).toBe("Rénovation de salle de bain");
    const customer = await getCustomer(ctx, lead.customer_id!);
    expect(customer.last_name).toBe("Jean Martin");
    expect(customer.billing_city).toBe("Villeurbanne");

    // Le devis accepté rend la demande gagnée.
    await saveDraft(
      ctx,
      quoteId,
      {
        ...draft,
        site: { line1: "3 rue Paul Verlaine", line2: "", postalCode: "69100", city: "Villeurbanne" },
        paymentTerms: "Solde à réception.",
        sections: [{ id: draft.sections[0].id, title: "", description: "", lines: [line()] }],
      },
      draft.draftRevision,
    );
    await db.query("UPDATE customers SET billing_line1='3 rue Paul Verlaine', billing_postal_code='69100' WHERE id=$1", [lead.customer_id]);
    await issueQuote(ctx, quoteId);
    await recordResponseManually(ctx, quoteId, { decision: "accept", version: 1, proof: "Signé sur place" });
    expect((await listLeads(ctx)).find((l) => l.id === id)?.status).toBe("gagnee");

    // Isolation entre entreprises.
    await expect(getLead(other, id)).rejects.toMatchObject({ status: 404 });
    expect(await listLeads(other)).toHaveLength(0);

    // Fiche client : facturé, encaissé, reste dû.
    const dep = await createDepositInvoice(ctx, quoteId, { percent: "50" });
    await recordPayment(ctx, dep.id, { amount: "200", paidOn: "2026-10-12", method: "virement" });
    const balance = customerBalance(await listInvoices(ctx, { customerId: lead.customer_id! }));
    expect(balance).toMatchObject({ invoicedCents: 49500, paidCents: 20000, dueCents: 29500 });
  });
});
