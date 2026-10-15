import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { formatQuantity, materialBalance, parseQuantity } from "@/lib/material-balance";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { addLeftover, deleteLeftover, jobMaterialBalance, materialSummary } from "@/lib/services/material-balance";
import { createOrder, saveLine } from "@/lib/services/purchase-orders";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("calcul du bilan matière", () => {
  it("regroupe par matériau, déduit rendus et restes et repère les commandes trop larges", () => {
    const b = materialBalance(
      [
        { id: "a", label: "Carrelage 60x60", unit: "m²", orderedMilli: 20_000, receivedMilli: 22_000, unitCostCents: 3000 },
        { id: "b", label: "carrelage  60x60", unit: "m²", orderedMilli: 5_000, receivedMilli: 0, unitCostCents: 3000 },
        { id: "c", label: "Colle", unit: "sac", orderedMilli: 10_000, receivedMilli: 10_000, unitCostCents: 1500 },
      ],
      new Map([["a", 2_000]]),
      [
        { id: "x", orderLineId: "b", label: "Carrelage 60x60", unit: "m²", quantityMilli: 3_000, unitCostCents: 3000, fate: "reemploi" },
        { id: "y", orderLineId: null, label: "Colle", unit: "sac", quantityMilli: 500, unitCostCents: 1500, fate: "dechet" },
      ],
    );
    const tiles = b.rows.find((r) => r.label === "Carrelage 60x60")!;
    expect(tiles).toMatchObject({ receivedMilli: 27_000, returnedMilli: 2_000, leftoverMilli: 3_000, usedMilli: 22_000, surplusBp: 1852, surplusCents: 15000 });
    expect(b.rows.find((r) => r.label === "Colle")).toMatchObject({ usedMilli: 9_500, surplusBp: 500 });
    expect(b.overOrdered).toEqual(["Carrelage 60x60"]);
    expect(b.fates).toEqual({ stock: 0, reemploi: 9000, dechet: 750 });
    expect(parseQuantity("2,5")).toBe(2500);
    expect(() => parseQuantity("0")).toThrow();
    expect(formatQuantity(2500)).toBe("2,5");
  });
});

describe("bilan matière d'un chantier", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;
  let lineId: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "matiere@chantier.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      { ...d, title: "Sol", site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" }, sections: [{ ...d.sections[0], lines: [line()] }] },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    jobId = await createJobFromQuote(ctx, id);
    const orderId = await createOrder(ctx, jobId, "Négoce Durand");
    lineId = await saveLine(ctx, orderId, { label: "Carrelage 60x60", unit: "m²", quantity: "25", unitCost: "30" });
  });

  it("note les restes et calcule le surplus", async () => {
    await expect(addLeftover(ctx, jobId, { quantity: "2", fate: "stock" })).rejects.toThrow(/matériau/);
    await expect(addLeftover(ctx, jobId, { orderLineId: lineId, quantity: "abc", fate: "stock" })).rejects.toThrow(/Quantité/);
    const id = await addLeftover(ctx, jobId, { orderLineId: lineId, quantity: "4", fate: "reemploi" });
    await addLeftover(ctx, jobId, { label: "Plinthes bois", unit: "ml", quantity: "6", fate: "dechet" });
    const b = await jobMaterialBalance(ctx, jobId);
    expect(b.rows.find((r) => r.label === "Carrelage 60x60")).toMatchObject({
      receivedMilli: 25_000,
      leftoverMilli: 4_000,
      usedMilli: 21_000,
      surplusBp: 1600,
      surplusCents: 12000,
    });
    expect(b.overOrdered).toEqual(["Carrelage 60x60"]);
    expect(b.fates.reemploi).toBe(12000);
    const s = await materialSummary(ctx);
    expect(s).toMatchObject({ jobs: 1, surplusCents: 12000 });
    expect(await deleteLeftover(ctx, id)).toBe(jobId);
    expect((await jobMaterialBalance(ctx, jobId)).leftovers).toHaveLength(1);
    const worker = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(jobMaterialBalance(worker, jobId)).rejects.toMatchObject({ status: 403 });
  });
});
