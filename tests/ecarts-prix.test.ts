import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { keepMarginPrice4, reviewItem } from "@/lib/price-review";
import { createItem, getItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { addPurchase } from "@/lib/services/job-costs";
import { createJobFromQuote, getJob } from "@/lib/services/jobs";
import { applyCostCorrection, priceReview } from "@/lib/services/price-review";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("analyse d'un écart", () => {
  it("cumule les chantiers et propose un coût arrondi au centime", () => {
    const r = reviewItem(
      [
        { jobId: "a", plannedCents: 12000, realCents: 13800, quantityMilli: 1000 },
        { jobId: "b", plannedCents: 24000, realCents: 26700, quantityMilli: 2000 },
      ],
      1200000,
    );
    expect(r).toMatchObject({
      jobs: 2,
      gapBp: 1250,
      observedCost4: 1350000,
      catalogGapBp: 1250,
      action: "hausse",
      confidence: "moyenne",
      suggestedCost4: 1350000,
    });
    // Coût du catalogue déjà corrigé : plus rien à proposer.
    expect(reviewItem([{ jobId: "a", plannedCents: 12000, realCents: 13500, quantityMilli: 1000 }], 1350000)).toMatchObject({ action: "conforme" });
    expect(reviewItem([{ jobId: "a", plannedCents: 10000, realCents: 10300 }], 50000)).toMatchObject({ action: "conforme", suggestedCost4: null });
    expect(reviewItem([{ jobId: "a", plannedCents: 10000, realCents: 8000 }], 50000)).toMatchObject({ action: "baisse", suggestedCost4: 40000 });
    expect(reviewItem([{ jobId: "a", plannedCents: 0, realCents: 8000 }], 50000)).toBeNull();
    expect(keepMarginPrice4(1890000, 1200000, 1350000)).toBe(2126300);
  });
});

describe("écarts des chantiers terminés", () => {
  let db: Database;
  let ctx: Ctx;
  let receveur: string;
  let colle: string;

  async function job(title: string, lines: Record<string, unknown>[]) {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, title, sections: [{ ...d.sections[0], lines: lines.map((l) => line(l)) }] }, d.draftRevision);
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    const jobId = await createJobFromQuote(ctx, id);
    const { tasks } = await getJob(ctx, jobId);
    return { jobId, tasks };
  }

  async function buy(jobId: string, taskId: string, amount: string) {
    await addPurchase(ctx, jobId, { date: "2026-10-10", label: "Achat", amount, taskId });
  }

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "ecarts@exemple.fr");
    await completeProfile(ctx);
    receveur = await createItem(ctx, { name: "Receveur extra-plat", unit: "u", unit_price: "189", unit_cost: "120", category: "materiau", vat_percent: "10" });
    colle = await createItem(ctx, { name: "Colle C2", unit: "sac", unit_price: "18", unit_cost: "10", category: "materiau", vat_percent: "10" });
    const rec = { catalogItemId: receveur, nature: "materiau", label: "Receveur extra-plat", quantity: "1", unit: "u", unitPrice: "189", unitCost: "120" };
    const col = { catalogItemId: colle, nature: "materiau", label: "Colle C2", quantity: "5", unit: "sac", unitPrice: "18", unitCost: "10" };
    const a = await job("Douche Martin", [rec, col]);
    await buy(a.jobId, a.tasks[0].id, "138");
    await buy(a.jobId, a.tasks[1].id, "51");
    const b = await job("Douche Durand", [rec]);
    await buy(b.jobId, b.tasks[0].id, "132");
    // Chantier en cours : pas encore pris en compte.
    const c = await job("Douche Bernard", [rec]);
    await buy(c.jobId, c.tasks[0].id, "400");
    await db.query("UPDATE jobs SET status='termine' WHERE id = ANY($1::uuid[])", [[a.jobId, b.jobId]]);
  });

  it("compare chaque article au réel et propose une correction", async () => {
    const r = await priceReview(ctx);
    expect(r.finishedJobs).toBe(2);
    expect(r.labor).toBeNull();
    expect(r.items.map((i) => [i.name, i.jobs, i.plannedCents, i.realCents, i.action, i.suggestedCost4])).toEqual([
      ["Receveur extra-plat", 2, 24000, 27000, "hausse", 1350000],
      ["Colle C2", 1, 5000, 5100, "conforme", null],
    ]);
    expect(r.items[0].jobTitles.sort()).toEqual(["Douche Durand", "Douche Martin"]);
  });

  it("applique le coût proposé en gardant la marge si demandé", async () => {
    await expect(applyCostCorrection(ctx, colle)).rejects.toMatchObject({ status: 409 });
    const res = await applyCostCorrection(ctx, receveur, { keepMargin: true });
    expect(res).toMatchObject({ newCost4: 1350000, newPrice4: 2126300, priceChanged: true });
    const it = await getItem(ctx, receveur);
    expect([it.unit_cost4, it.unit_price4]).toEqual([1350000, 2126300]);
    // Le coût du catalogue suit désormais le réel : plus rien à proposer sur la base des mêmes chantiers.
    expect((await priceReview(ctx)).items[0]).toMatchObject({ name: "Receveur extra-plat", action: "conforme", suggestedCost4: null });
    const other = await signUp(db, "ecarts-autre@exemple.fr", "Autre");
    expect((await priceReview(other)).items).toEqual([]);
    await expect(applyCostCorrection(other, receveur)).rejects.toMatchObject({ status: 404 });
  });
});
