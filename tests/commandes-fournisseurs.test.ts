import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { createItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { jobCosts } from "@/lib/services/job-costs";
import { createJobFromQuote, getJob } from "@/lib/services/jobs";
import {
  cancelOrder,
  createOrder,
  deleteLine,
  getOrder,
  listOrders,
  orderPdf,
  prepareOrders,
  receiveOrder,
  recordSupplierInvoice,
  saveLine,
  sendOrder,
  updateOrder,
} from "@/lib/services/purchase-orders";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let jobId: string;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "commandes@exemple.fr");
  await completeProfile(ctx);
  const carrelage = await createItem(ctx, {
    name: "Carrelage grès cérame",
    reference: "GC-6060",
    category: "materiau",
    unit: "m²",
    unit_price: "30",
    unit_cost: "18",
    vat_percent: "10",
    supplier: "Négoce du Rhône",
  });
  const qid = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, qid);
  await saveDraft(
    ctx,
    qid,
    {
      ...d,
      title: "Salle de bains",
      site: { line1: "4 rue des Lilas", line2: "", postalCode: "69003", city: "Lyon" },
      sections: [
        {
          ...d.sections[0],
          lines: [
            line({ unitCost: "20" }),
            line({ nature: "materiau", label: "Carrelage grès cérame", unitPrice: "30", unitCost: "18", catalogItemId: carrelage }),
            line({ nature: "materiau", label: "Colle et joints", quantity: "2", unit: "sac", unitPrice: "40", unitCost: "25,50" }),
            line({ nature: "sous_traitance", label: "Électricité", quantity: "1", unit: "forfait", unitPrice: "600", unitCost: "450" }),
          ],
        },
      ],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, qid);
  await recordResponseManually(ctx, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  jobId = await createJobFromQuote(ctx, qid);
});

describe("commandes fournisseurs", () => {
  it("prépare une commande par fournisseur depuis le devis signé", async () => {
    await expect(prepareOrders({ ...ctx, role: "member" }, jobId)).rejects.toMatchObject({ status: 403 });
    const ids = await prepareOrders(ctx, jobId);
    expect(ids).toHaveLength(2);
    const orders = await listOrders(ctx, jobId);
    expect(orders.map((o) => o.number)).toEqual([expect.stringMatching(/^BC-\d{4}-0001$/), expect.stringMatching(/^BC-\d{4}-0002$/)]);
    const negoce = orders.find((o) => o.supplier === "Négoce du Rhône")!;
    expect(negoce.total_cents).toBe(36000);
    expect(negoce.delivery_address).toContain("4 rue des Lilas");
    const other = await getOrder(ctx, orders.find((o) => o.supplier === "")!.id);
    expect(other.lines.map((l) => [l.label, l.quantity, l.unit_cost_cents, l.total_cents])).toEqual([
      ["Colle et joints", "2", 2550, 5100],
      ["Électricité", "1", 45000, 45000],
    ]);
    const { lines } = await getOrder(ctx, negoce.id);
    expect(lines[0]).toMatchObject({ reference: "GC-6060", unit: "m²", quantity: "20" });
    const { tasks } = await getJob(ctx, jobId);
    expect(lines[0].task_id).toBe(tasks[1].id);
    // Déjà tout commandé.
    await expect(prepareOrders(ctx, jobId)).rejects.toMatchObject({ status: 409 });
  });

  it("modifie le brouillon puis l'envoie", async () => {
    const id = await createOrder(ctx, jobId);
    await expect(sendOrder(ctx, id)).rejects.toMatchObject({ status: 400 });
    await updateOrder(ctx, id, {
      supplier: "Loc'Matériel",
      supplierEmail: "contact@locmat.fr",
      deliveryDate: "2026-10-20",
      notes: "Livrer le matin",
    });
    await expect(sendOrder(ctx, id)).rejects.toMatchObject({ status: 400 });
    await expect(saveLine(ctx, id, { label: "Échafaudage", quantity: "abc" })).rejects.toMatchObject({ status: 400 });
    await saveLine(ctx, id, { label: "Échafaudage", unit: "jour", quantity: "5", unitCost: "35" });
    await saveLine(ctx, id, { label: "Benne", quantity: "1", unitCost: "180" });
    let o = await getOrder(ctx, id);
    expect(o.totalCents).toBe(17500 + 18000);
    await deleteLine(ctx, id, o.lines[1].id);
    await saveLine(ctx, id, { id: o.lines[0].id, label: "Échafaudage roulant", unit: "jour", quantity: "4", unitCost: "35" });
    o = await getOrder(ctx, id);
    expect(o.lines.map((l) => [l.label, l.total_cents])).toEqual([["Échafaudage roulant", 14000]]);
    await sendOrder(ctx, id);
    o = await getOrder(ctx, id);
    expect(o.order.status).toBe("envoye");
    await expect(saveLine(ctx, id, { label: "Benne", quantity: "1" })).rejects.toMatchObject({ status: 409 });
    const { pdf, number } = await orderPdf(ctx, id);
    expect(number).toBe(o.order.number);
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    await cancelOrder(ctx, id);
    expect((await getOrder(ctx, id)).order.status).toBe("annule");
  });

  it("réception partielle puis complète, rapprochement de la facture", async () => {
    const negoce = (await listOrders(ctx, jobId)).find((o) => o.supplier === "Négoce du Rhône")!;
    await expect(receiveOrder(ctx, negoce.id, {})).rejects.toMatchObject({ status: 409 });
    await sendOrder(ctx, negoce.id);
    const [l] = (await getOrder(ctx, negoce.id)).lines;
    await expect(receiveOrder(ctx, negoce.id, { [l.id]: "100" })).rejects.toMatchObject({ status: 400 });
    expect(await receiveOrder(ctx, negoce.id, { [l.id]: "12,5" })).toBe("recu_partiel");
    let o = await getOrder(ctx, negoce.id);
    expect(o.receivedCents).toBe(22500);
    expect(await receiveOrder(ctx, negoce.id, { [l.id]: "20" })).toBe("recu");
    await expect(cancelOrder(ctx, negoce.id)).rejects.toMatchObject({ status: 409 });

    o = await recordSupplierInvoice(ctx, negoce.id, { date: "2026-10-12", amount: "360,80", reference: "F-889" });
    expect(o.matching).toBe("conforme");
    o = await recordSupplierInvoice(ctx, negoce.id, { date: "2026-10-13", amount: "45", reference: "F-890" });
    expect(o).toMatchObject({ matching: "ecart", invoicedCents: 40580, gapCents: 4580 });
    // La facture devient un achat du chantier.
    const c = await jobCosts(ctx, jobId);
    expect(c.real.purchasesCents).toBe(40580);
  });
});
