import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { lineKey, mergeLines } from "@/lib/order-groups";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createGroup, deleteGroup, draftsBySupplier, getGroup, groupPdf, listGroups, sendGroup } from "@/lib/services/order-groups";
import { createOrder, getOrder, saveLine, sendOrder } from "@/lib/services/purchase-orders";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("fusion des lignes", () => {
  it("additionne le même article et garde la part de chaque chantier", () => {
    const merged = mergeLines([
      {
        orderNumber: "BC-1",
        jobTitle: "Cuisine",
        lines: [
          { label: "Colle C2", reference: "COL-C2", unit: "sac", quantityMilli: 4000, unitCostCents: 1250 },
          { label: "Plinthe", reference: "", unit: "ml", quantityMilli: 12500, unitCostCents: 300 },
        ],
      },
      {
        orderNumber: "BC-2",
        jobTitle: "Salle de bains",
        lines: [
          { label: "Colle carrelage C2", reference: "col-c2", unit: "sac", quantityMilli: 2000, unitCostCents: 1250 },
          { label: "Colle C2", reference: "COL-C2", unit: "sac", quantityMilli: 1000, unitCostCents: 1100 },
        ],
      },
    ]);
    expect(merged.map((m) => [m.reference || m.label, m.quantityMilli, m.totalCents, m.split.length])).toEqual([
      ["COL-C2", 6000, 7500, 2],
      ["Plinthe", 12500, 3750, 1],
      ["COL-C2", 1000, 1100, 1],
    ]);
    expect(merged[0].split.map((s) => s.jobTitle)).toEqual(["Cuisine", "Salle de bains"]);
    expect(lineKey({ label: "A", reference: "", unit: "U ", quantityMilli: 1, unitCostCents: 5 })).toBe("lib:a|u|5");
  });
});

describe("commande groupée", () => {
  let db: Database;
  let ctx: Ctx;
  const jobs: string[] = [];
  const orders: string[] = [];

  async function job(title: string) {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, title, sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    return createJobFromQuote(ctx, id);
  }

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "groupees@exemple.fr");
    await completeProfile(ctx);
    jobs.push(await job("Cuisine"), await job("Salle de bains"), await job("Garage"));
    for (const [i, j] of jobs.entries()) {
      const o = await createOrder(ctx, j, i === 2 ? "Point P" : "Cedeo Lyon");
      await saveLine(ctx, o, { label: "Colle C2", reference: "COL-C2", unit: "sac", quantity: String(i + 2), unitCost: "12,50" });
      orders.push(o);
    }
  });

  it("propose les fournisseurs communs à plusieurs chantiers", async () => {
    const list = await draftsBySupplier(ctx);
    expect(list.map((g) => [g.supplier, g.orders.map((o) => o.jobTitle)])).toEqual([["Cedeo Lyon", ["Cuisine", "Salle de bains"]]]);
  });

  it("regroupe, édite un seul bon puis envoie toutes les commandes", async () => {
    await expect(createGroup(ctx, { orderIds: [orders[0]], deliveryAddress: "Dépôt, 3 rue des Artisans, Lyon" })).rejects.toMatchObject({ status: 400 });
    await expect(createGroup(ctx, { orderIds: [orders[0], orders[2]], deliveryAddress: "Dépôt, 3 rue des Artisans, Lyon" })).rejects.toMatchObject({
      status: 400,
    });
    const id = await createGroup(ctx, { orderIds: [orders[0], orders[1]], deliveryAddress: "Dépôt, 3 rue des Artisans, Lyon", deliveryDate: "2026-10-20" });
    expect(await draftsBySupplier(ctx)).toEqual([]);
    await expect(createGroup(ctx, { orderIds: [orders[0], orders[1]], deliveryAddress: "Dépôt, 3 rue des Artisans" })).rejects.toMatchObject({ status: 409 });
    const g = await getGroup(ctx, id);
    expect(g.group.number).toMatch(/^CG-\d{4}-0001$/);
    expect(g.lines.map((l) => [l.label, l.quantityMilli, l.totalCents])).toEqual([["Colle C2", 5000, 6250]]);
    expect((await getOrder(ctx, orders[0])).order.delivery_address).toBe("Dépôt, 3 rue des Artisans, Lyon");
    const pdf = await PDFDocument.load((await groupPdf(ctx, id)).pdf);
    expect(pdf.getTitle()).toBe(`Commande groupée ${g.group.number}`);
    await sendGroup(ctx, id);
    expect((await getOrder(ctx, orders[1])).order.status).toBe("envoye");
    await expect(sendGroup(ctx, id)).rejects.toMatchObject({ status: 409 });
    await expect(deleteGroup(ctx, id)).rejects.toMatchObject({ status: 409 });
    expect((await listGroups(ctx)).map((x) => [x.supplier, x.orders, !!x.sentAt])).toEqual([["Cedeo Lyon", 2, true]]);
  });

  it("dégroupe avant l'envoi et reste réservé à l'entreprise", async () => {
    const o = await createOrder(ctx, jobs[0], "Point P");
    await saveLine(ctx, o, { label: "Ciment", reference: "", unit: "sac", quantity: "10", unitCost: "8" });
    const id = await createGroup(ctx, { orderIds: [orders[2], o], deliveryAddress: "Chantier du garage, Villeurbanne" });
    await deleteGroup(ctx, id);
    expect((await draftsBySupplier(ctx)).map((g) => g.supplier)).toEqual(["Point P"]);
    await sendOrder(ctx, o);
    const other = await signUp(db, "groupees-autre@exemple.fr", "Autre");
    await expect(getGroup(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(createGroup(other, { orderIds: [orders[2], o], deliveryAddress: "Quelque part" })).rejects.toMatchObject({ status: 404 });
  });
});
