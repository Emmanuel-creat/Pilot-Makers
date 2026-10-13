import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { addPurchase, budgetAlert, budgetAlerts, deletePurchase, jobCosts, listPurchases, setBudgetThreshold } from "@/lib/services/job-costs";
import { createJobFromQuote, getJob } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { addEntry, setMemberQualification } from "@/lib/services/timesheets";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let jobId: string;
const NOW = new Date("2026-10-20T12:00:00Z");

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "couts@exemple.fr");
  await completeProfile(ctx);
  await db.query("UPDATE organizations SET pricing=$2 WHERE id=$1", [
    ctx.orgId,
    JSON.stringify({ laborRates: [{ label: "Ouvrier", priceCents: 4500, costCents: 3000 }] }),
  ]);
  await setMemberQualification(ctx, ctx.userId, "Ouvrier");
  const qid = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, qid);
  await saveDraft(
    ctx,
    qid,
    {
      ...d,
      title: "Salle de bains",
      sections: [
        {
          ...d.sections[0],
          lines: [
            // Main-d'oeuvre : 20 m² à 45 euros, coût prévu 20 euros le m², soit 400 euros.
            line({ unitCost: "20" }),
            // Fournitures : 20 m² de carrelage à 30 euros, coût prévu 18 euros, soit 360 euros.
            line({ nature: "materiau", label: "Carrelage grès cérame", unitPrice: "30", unitCost: "18" }),
            // Ligne sans coût renseigné.
            line({ nature: "materiau", label: "Colle et joints", quantity: "1", unit: "forfait", unitPrice: "80", unitCost: "" }),
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

describe("coûts de chantier", () => {
  it("reprend le coût prévu de chaque ligne du devis", async () => {
    const { tasks } = await getJob(ctx, jobId);
    expect(tasks.map((t) => [t.nature, t.cost_cents])).toEqual([
      ["main_oeuvre", 40000],
      ["materiau", 36000],
      ["materiau", null],
    ]);
    const c = await jobCosts(ctx, jobId);
    expect(c.soldCents).toBe(90000 + 60000 + 8000);
    expect(c.planned).toEqual({ laborCents: 40000, purchasesCents: 36000, totalCents: 76000, marginCents: 158000 - 76000 });
    expect(c.alert).toBe("none");
  });

  it("achats affectés, avoir fournisseur, écart ligne par ligne", async () => {
    const { tasks } = await getJob(ctx, jobId);
    await expect(addPurchase(ctx, jobId, { date: "2026-10-12", label: "Carrelage", amount: "abc" })).rejects.toMatchObject({ status: 400 });
    await expect(addPurchase({ ...ctx, role: "member" }, jobId, { date: "2026-10-12", label: "Carrelage", amount: "10" })).rejects.toMatchObject({
      status: 403,
    });
    await addPurchase(ctx, jobId, {
      date: "2026-10-12",
      label: "Carrelage 60x60",
      supplier: "Négoce du Rhône",
      amount: "395,50",
      taskId: tasks[1].id,
    });
    await addPurchase(ctx, jobId, { date: "2026-10-13", label: "Retour de 2 cartons", amount: "-40", taskId: tasks[1].id });
    await addPurchase(ctx, jobId, { date: "2026-10-13", label: "Location de carrelette", category: "location", amount: "25" });
    expect(await listPurchases(ctx, jobId)).toHaveLength(3);
    const c = await jobCosts(ctx, jobId);
    expect(c.real.purchasesCents).toBe(39550 - 4000 + 2500);
    expect(c.unassignedPurchasesCents).toBe(2500);
    expect(c.tasks[1]).toMatchObject({ realPurchasesCents: 35550, gapCents: 36000 - 35550 });
    expect(c.tasks[0].gapCents).toBeNull();
  });

  it("heures valorisées, marge réelle et alerte de budget", async () => {
    // 12 h à 30 euros = 360 euros de main-d'oeuvre ; total réel 380 + 360 = 740 euros sur 760 prévus : 97 %, au-delà du seuil de 90 %.
    await addEntry(ctx, { jobId, date: "2026-10-12", duration: "8" }, NOW);
    await addEntry(ctx, { jobId, date: "2026-10-13", duration: "4" }, NOW);
    let c = await jobCosts(ctx, jobId);
    expect(c.real.laborCents).toBe(36000);
    expect(c.real.totalCents).toBe(74050);
    expect(c.real.marginCents).toBe(158000 - 74050);
    expect(c.consumedBp).toBe(9743);
    expect(c.alert).toBe("warning");
    expect((await budgetAlerts(ctx)).map((a) => a.alert)).toEqual(["warning"]);
    await setBudgetThreshold(ctx, jobId, "100");
    expect((await jobCosts(ctx, jobId)).alert).toBe("none");
    await expect(setBudgetThreshold(ctx, jobId, "20")).rejects.toMatchObject({ status: 400 });
    const extra = await addPurchase(ctx, jobId, { date: "2026-10-14", label: "Receveur oublié", amount: "120" });
    c = await jobCosts(ctx, jobId);
    expect(c.alert).toBe("over");
    expect(await budgetAlerts({ ...ctx, role: "member" })).toEqual([]);
    await deletePurchase(ctx, extra);
    expect((await jobCosts(ctx, jobId)).alert).toBe("none");
  });

  it("règle d'alerte", () => {
    expect(budgetAlert(0, 500, 9000)).toBe("none");
    expect(budgetAlert(1000, 899, 9000)).toBe("none");
    expect(budgetAlert(1000, 900, 9000)).toBe("warning");
    expect(budgetAlert(1000, 1001, 9000)).toBe("over");
  });
});
