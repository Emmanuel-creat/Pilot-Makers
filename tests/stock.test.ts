import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { createItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { listPurchases } from "@/lib/services/job-costs";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { archiveStockItem, createStockItem, getStock, moveStock, setThresholds, setVehicleKit } from "@/lib/services/stock";
import { DEPOT, refillList, reorderList, stockLevels, stockValueCents, type StockItemRef } from "@/lib/stock";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const ref = (o: Partial<StockItemRef> & { id: string }): StockItemRef => ({
  label: o.id,
  unit: "u",
  minQty: 0,
  reorderQty: 0,
  supplier: "",
  unitCost4: null,
  ...o,
});

describe("niveaux de stock", () => {
  const levels = stockLevels([
    { itemId: "colle", location: DEPOT, qty: 10 },
    { itemId: "colle", location: DEPOT, qty: -7 },
    { itemId: "colle", location: "van", qty: 2 },
    { itemId: "silicone", location: DEPOT, qty: 30 },
  ]);

  it("signale les articles au seuil avec la quantité à commander", () => {
    const list = reorderList(
      [ref({ id: "colle", minQty: 5, reorderQty: 20, unitCost4: 125000 }), ref({ id: "silicone", minQty: 10 }), ref({ id: "joint", minQty: 4 })],
      levels,
    );
    expect(list.map((r) => [r.item.id, r.have, r.order, r.costCents])).toEqual([
      ["colle", 3, 20, 25000],
      ["joint", 0, 8, null],
    ]);
  });

  it("calcule ce qu'il faut recharger dans les véhicules", () => {
    expect(
      refillList(
        [
          { itemId: "colle", vehicleId: "van", target: 6 },
          { itemId: "silicone", vehicleId: "van", target: 4 },
        ],
        levels,
      ),
    ).toEqual([
      { itemId: "colle", vehicleId: "van", target: 6, have: 2, missing: 4, fromDepot: 3 },
      { itemId: "silicone", vehicleId: "van", target: 4, have: 0, missing: 4, fromDepot: 4 },
    ]);
  });

  it("valorise le stock au coût d'achat connu", () => {
    expect(stockValueCents([ref({ id: "colle", unitCost4: 125000 }), ref({ id: "silicone" })], levels)).toBe(6250);
  });
});

describe("stock de l'entreprise", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;
  let van: string;
  let colle: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "stock@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, title: "Cuisine", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    jobId = await createJobFromQuote(ctx, id);
    van = (await db.query<{ id: string }>("INSERT INTO org_vehicles (org_id, name) VALUES ($1,'Fourgon') RETURNING id", [ctx.orgId]))[0].id;
  });

  it("suit un article du catalogue avec son coût d'achat", async () => {
    const cat = await createItem(ctx, {
      name: "Colle carrelage C2",
      category: "materiau",
      vat_percent: "20",
      unit: "sac",
      unit_price: "25",
      unit_cost: "12,50",
    });
    colle = await createStockItem(ctx, { catalogItemId: cat, minQty: "5", reorderQty: "20" });
    await expect(createStockItem(ctx, { catalogItemId: cat })).rejects.toMatchObject({ status: 400 });
    await expect(createStockItem(ctx, { label: "x" })).rejects.toMatchObject({ status: 400 });
    const s = await getStock(ctx);
    expect(s.items[0]).toMatchObject({ label: "Colle carrelage C2", unit: "sac", unitCost4: 125000, minQty: 5, reorderQty: 20 });
    expect(s.reorder.map((r) => r.order)).toEqual([20]);
  });

  it("entre, transfère, sort vers un chantier et compte l'inventaire", async () => {
    await moveStock(ctx, { itemId: colle, kind: "entree", qty: "20", to: DEPOT });
    await moveStock(ctx, { itemId: colle, kind: "transfert", qty: "4", from: DEPOT, to: van });
    await expect(moveStock(ctx, { itemId: colle, kind: "transfert", qty: "10", from: van, to: DEPOT })).rejects.toMatchObject({ status: 400 });
    await expect(moveStock(ctx, { itemId: colle, kind: "sortie", qty: "2", from: van })).rejects.toMatchObject({ status: 400 });
    await moveStock(ctx, { itemId: colle, kind: "sortie", qty: "3", from: van, jobId }, new Date("2026-10-14T10:00:00Z"));
    const purchases = await listPurchases(ctx, jobId);
    expect(purchases.map((p) => [p.label, p.amount_ht_cents, p.supplier])).toEqual([["Sortie de stock : Colle carrelage C2 (3 sac)", 3750, "Stock"]]);
    expect(await moveStock(ctx, { itemId: colle, kind: "inventaire", qty: "14", to: DEPOT })).toEqual({ delta: -2 });
    expect(await moveStock(ctx, { itemId: colle, kind: "inventaire", qty: "14", to: DEPOT })).toEqual({ delta: 0 });
    const s = await getStock(ctx);
    expect([s.qty(colle, DEPOT), s.qty(colle, van)]).toEqual([14, 1]);
    expect(s.reorder).toEqual([]);
    expect(s.valueCents).toBe(Math.round(15 * 1250));
    expect(s.moves[0]).toMatchObject({ kind: "inventaire", qty: -2 });
  });

  it("gère la dotation des véhicules, les seuils et l'archivage", async () => {
    await expect(setVehicleKit(ctx, colle, DEPOT, "3")).rejects.toMatchObject({ status: 400 });
    await setVehicleKit(ctx, colle, van, "3");
    let s = await getStock(ctx);
    expect(s.refill).toEqual([{ itemId: colle, vehicleId: van, target: 3, have: 1, missing: 2, fromDepot: 2 }]);
    await setVehicleKit(ctx, colle, van, "0");
    await setThresholds(ctx, colle, { minQty: "15", reorderQty: "" });
    s = await getStock(ctx);
    expect(s.refill).toEqual([]);
    expect(s.reorder.map((r) => r.order)).toEqual([16]);
    const other = await signUp(db, "stock-autre@exemple.fr", "Autre");
    await expect(moveStock(other, { itemId: colle, kind: "entree", qty: "1" })).rejects.toMatchObject({ status: 404 });
    await archiveStockItem(ctx, colle);
    expect((await getStock(ctx)).items).toEqual([]);
  });
});
