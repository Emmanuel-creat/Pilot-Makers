import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { listPurchases } from "@/lib/services/job-costs";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createOrder, getOrder, receiveOrder, recordSupplierInvoice, saveLine, sendOrder } from "@/lib/services/purchase-orders";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { collectReturn, createReturn, creditReturn, deleteReturn, listDeliveries, listReturns, openReturns } from "@/lib/services/supplier-returns";
import { deliveryDeltas, expectedCreditCents, returnableMilli } from "@/lib/supplier-returns";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("calculs des retours", () => {
  it("déduit les frais de reprise et borne ce qui reste à retourner", () => {
    expect(deliveryDeltas({ a: 2000, b: 0 }, { a: 5000, b: 0, c: 1000 })).toEqual({ a: 3000, c: 1000 });
    expect(returnableMilli(5000, 2000)).toBe(3000);
    expect(returnableMilli(1000, 2000)).toBe(0);
    expect(expectedCreditCents(2000, 1250)).toBe(2500);
    expect(expectedCreditCents(2000, 1250, 1500)).toBe(2125);
  });
});

describe("livraisons et retours d'une commande", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;
  let orderId: string;
  let colle: string;
  let carreau: string;
  const NOW = new Date("2026-10-14T10:00:00Z");

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "retours@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, title: "Salle de bains", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    jobId = await createJobFromQuote(ctx, id);
    orderId = await createOrder(ctx, jobId, "Cedeo Lyon");
    await saveLine(ctx, orderId, { label: "Colle C2", reference: "COL-C2", unit: "sac", quantity: "10", unitCost: "12,50" });
    await saveLine(ctx, orderId, { label: "Carreau 60x60", reference: "", unit: "m²", quantity: "20", unitCost: "30" });
    const { lines } = await getOrder(ctx, orderId);
    colle = lines.find((l) => l.label === "Colle C2")!.id;
    carreau = lines.find((l) => l.label === "Carreau 60x60")!.id;
    await sendOrder(ctx, orderId);
  });

  it("garde chaque livraison avec son bon et ses réserves", async () => {
    await expect(receiveOrder(ctx, orderId, { [colle]: "6" }, { deliveredOn: "2026-10-20" }, NOW)).rejects.toMatchObject({ status: 400 });
    expect(await receiveOrder(ctx, orderId, { [colle]: "6" }, { deliveredOn: "2026-10-12", noteNumber: "BL-881" }, NOW)).toBe("recu_partiel");
    expect(
      await receiveOrder(
        ctx,
        orderId,
        { [colle]: "10", [carreau]: "20" },
        { deliveredOn: "2026-10-13", noteNumber: "BL-902", issues: "2 m² de carreaux cassés" },
        NOW,
      ),
    ).toBe("recu");
    // Une saisie sans changement de quantité ni réserve n'ajoute pas de livraison.
    await receiveOrder(ctx, orderId, { [colle]: "10" }, {}, NOW);
    const list = await listDeliveries(ctx, orderId);
    expect(list.map((d) => [d.deliveredOn, d.noteNumber, d.lines.map((l) => [l.label, l.quantityMilli])])).toEqual([
      ["2026-10-12", "BL-881", [["Colle C2", 6000]]],
      [
        "2026-10-13",
        "BL-902",
        [
          ["Colle C2", 4000],
          ["Carreau 60x60", 20000],
        ],
      ],
    ]);
    expect(list[1].issues).toBe("2 m² de carreaux cassés");
  });

  it("suit un retour jusqu'à l'avoir, déduit des achats du chantier", async () => {
    await recordSupplierInvoice(ctx, orderId, { date: "2026-10-13", amount: "725", reference: "F-55" });
    expect((await getOrder(ctx, orderId)).matching).toBe("conforme");
    await expect(createReturn(ctx, orderId, { lineId: carreau, quantity: "25", reason: "casse" })).rejects.toMatchObject({ status: 400 });
    await expect(createReturn(ctx, orderId, { lineId: carreau, quantity: "2", reason: "perdu" })).rejects.toMatchObject({ status: 400 });
    const casse = await createReturn(ctx, orderId, { lineId: carreau, quantity: "2", reason: "casse", notes: "Cassés au déchargement", restocking: "20" });
    const surplus = await createReturn(ctx, orderId, { lineId: colle, quantity: "4", reason: "surplus", restocking: "10" });
    const rs = await listReturns(ctx, orderId);
    // Pas de frais de reprise sur une casse, 10 % sur un surplus.
    expect(rs.map((r) => [r.label, r.restockingBp, r.expectedCents, r.status])).toEqual([
      ["Carreau 60x60", 0, 6000, "a_reprendre"],
      ["Colle C2", 1000, 4500, "a_reprendre"],
    ]);
    const o = await getOrder(ctx, orderId);
    expect([o.returnedCents, o.receivedCents, o.matching]).toEqual([10500, 62000, "ecart"]);
    expect((await openReturns(ctx)).expectedCents).toBe(10500);

    await expect(collectReturn(ctx, casse, "2026-10-20", NOW)).rejects.toMatchObject({ status: 400 });
    await collectReturn(ctx, casse, "2026-10-14", NOW);
    await expect(collectReturn(ctx, casse, "2026-10-14", NOW)).rejects.toMatchObject({ status: 409 });
    await expect(deleteReturn(ctx, casse)).rejects.toMatchObject({ status: 409 });
    const res = await creditReturn(ctx, casse, { amount: "60", reference: "AV-12", date: "2026-10-14" }, NOW);
    expect(res.gapCents).toBe(0);
    await expect(creditReturn(ctx, casse, { amount: "60", date: "2026-10-14" }, NOW)).rejects.toMatchObject({ status: 409 });
    await deleteReturn(ctx, surplus);
    const after = await getOrder(ctx, orderId);
    expect([after.receivedCents, after.invoicedCents, after.matching]).toEqual([66500, 66500, "conforme"]);
    const purchases = await listPurchases(ctx, jobId);
    expect(purchases.find((p) => p.amount_ht_cents < 0)).toMatchObject({ amount_ht_cents: -6000, reference: "AV-12" });
    expect((await openReturns(ctx)).list).toEqual([]);
  });

  it("reste réservé à l'entreprise", async () => {
    const other = await signUp(db, "retours-autre@exemple.fr", "Autre");
    await expect(createReturn(other, orderId, { lineId: colle, quantity: "1", reason: "erreur" })).rejects.toMatchObject({ status: 404 });
    expect(await listReturns(other, orderId)).toEqual([]);
    expect(await listDeliveries(other, orderId)).toEqual([]);
  });
});
