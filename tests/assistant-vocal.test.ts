import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice, getInvoice } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { executeVoice, prepareVoice } from "@/lib/services/voice-assistant";
import { parseCommand, spokenAmount, spokenEmail, spokenPhone } from "@/lib/voice-commands";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let customerId: string;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "vocal@exemple.fr");
  await completeProfile(ctx);
  customerId = await makeCustomer(ctx, { first_name: "Paul", last_name: "Durand" });
});

const values = (p: Awaited<ReturnType<typeof prepareVoice>>) => (p.kind === "confirm" ? Object.fromEntries(p.fields.map((f) => [f.name, f.value])) : {});

describe("compréhension des phrases", () => {
  it("montants, téléphones, e-mails dits", () => {
    expect(spokenAmount("23 euros 40")).toBe("23,40");
    expect(spokenAmount("1 250 €")).toBe("1250");
    expect(spokenAmount("12,5 euros")).toBe("12,50");
    expect(spokenAmount("rien")).toBe("");
    expect(spokenPhone("au +33 6 12 34 56 78")).toBe("06 12 34 56 78");
    expect(spokenEmail("paul arobase exemple point fr")).toBe("paul@exemple.fr");
  });

  it("intentions reconnues", () => {
    expect(parseCommand("Ouvre le planning")).toEqual({ kind: "navigate", href: "/app/planning", label: "Planning" });
    expect(parseCommand("Ajoute le client Paul Durand au 06 12 34 56 78 à Lyon")).toMatchObject({
      kind: "create_customer",
      firstName: "Paul",
      lastName: "Durand",
      phone: "06 12 34 56 78",
      city: "Lyon",
    });
    expect(parseCommand("Nouvelle cliente société Bâti Rhône")).toMatchObject({ kind: "create_customer", company: "Bâti Rhône" });
    expect(parseCommand("Note de frais 80 € d'essence avec la carte de l'entreprise")).toMatchObject({
      kind: "expense",
      amount: "80",
      category: "carburant",
      payment: "entreprise",
    });
    expect(parseCommand("Enregistre un règlement de 1 200,50 € sur la facture FA 2026 004")).toMatchObject({
      kind: "payment",
      invoiceRef: "FA2026004",
      amount: "1200,50",
    });
    expect(parseCommand("Quelles factures sont en retard ?")).toEqual({ kind: "question", topic: "overdue" });
    expect(parseCommand("Cherche Dupont")).toEqual({ kind: "search", query: "Dupont" });
  });
});

describe("préparation puis exécution", () => {
  it("devis pour un client retrouvé, avec son objet", async () => {
    const p = await prepareVoice(ctx, "Crée un devis pour Paul Durand rénovation salle de bain");
    expect(p).toMatchObject({ kind: "confirm", action: "quote" });
    expect(values(p)).toMatchObject({ customerId, title: "Rénovation salle de bain" });
    const r = await executeVoice(ctx, "quote", values(p));
    expect(r.href).toMatch(/^\/app\/devis\/[0-9a-f-]{36}$/);
    const unknown = await prepareVoice(ctx, "Crée un devis pour Zorglub");
    expect(values(unknown).customerId).toBe("");
  });

  it("client créé après relecture, doublon signalé", async () => {
    const p = await prepareVoice(ctx, "Ajoute le client Marc Petit au 06 11 22 33 44 à Grenoble");
    const r = await executeVoice(ctx, "customer", values(p));
    expect(r.href).toMatch(/^\/app\/clients\//);
    const again = await executeVoice(ctx, "customer", values(p));
    expect(again.say).toContain("existe déjà");
  });

  it("note de frais et question sur l'activité", async () => {
    const p = await prepareVoice(ctx, "Note de frais de 23 euros 40 pour un repas chez Relais des Artisans");
    expect(values(p)).toMatchObject({ amount: "23,40", category: "repas", merchant: "Relais des Artisans" });
    await executeVoice(ctx, "expense", { ...values(p), vat: "2,13" });
    expect((await prepareVoice(ctx, "Combien de devis en attente de réponse ?")).kind).toBe("answer");
    expect((await prepareVoice(ctx, "Qu'est-ce que j'ai aujourd'hui ?")).say).toContain("planning");
  });

  it("paiement d'une facture retrouvée par son numéro ou par le client", async () => {
    const qid = await createQuote(ctx, { customerId });
    const d = await getDraft(ctx, qid);
    await saveDraft(ctx, qid, { ...d, title: "Cuisine", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
    await issueQuote(ctx, qid);
    await recordResponseManually(ctx, qid, { decision: "accept", version: 1, proof: "Signé" });
    const inv = await getInvoice(ctx, (await createFinalInvoice(ctx, qid)).id);
    const byNumber = await prepareVoice(ctx, `La facture ${inv.number} est payée par chèque`);
    expect(values(byNumber)).toMatchObject({ invoiceId: inv.id, method: "cheque" });
    const byName = await prepareVoice(ctx, "Durand a payé 100 euros par virement");
    expect(values(byName)).toMatchObject({ invoiceId: inv.id, amount: "100" });
    const r = await executeVoice(ctx, "payment", values(byName));
    expect(r.href).toBe(`/app/factures/${inv.id}`);
    expect((await getInvoice(ctx, inv.id)).paid_cents).toBe(10000);
    expect((await prepareVoice(ctx, "La facture ZZ-999 est payée")).kind).toBe("answer");
  });

  it("aide et refus", async () => {
    const help = await prepareVoice(ctx, "Comment faire une facture d'acompte");
    expect(help).toMatchObject({ kind: "answer" });
    await expect(prepareVoice(ctx, "  ")).rejects.toMatchObject({ status: 400 });
    await expect(executeVoice(ctx, "supprimer", {})).rejects.toMatchObject({ status: 400 });
  });
});
