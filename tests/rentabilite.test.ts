import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { jobType } from "@/lib/job-types";
import type { Ctx } from "@/lib/services/context";
import { addPurchase } from "@/lib/services/job-costs";
import { createJobFromQuote } from "@/lib/services/jobs";
import { groupProfits, profitability, type JobProfit } from "@/lib/services/profitability";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

async function job(title: string, customerId: string, lines: ReturnType<typeof line>[]) {
  const id = await createQuote(ctx, { customerId });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    { ...d, title, site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" }, sections: [{ ...d.sections[0], lines }] },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  const jobId = await createJobFromQuote(ctx, id);
  await db.query("UPDATE jobs SET status='en_cours', start_date=current_date WHERE id=$1", [jobId]);
  return jobId;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "rentabilite@exemple.fr");
  await completeProfile(ctx);
});

describe("rentabilité : regroupements", () => {
  it("type de chantier déduit de l'intitulé", () => {
    expect(jobType("Rénovation salle de bains étage")).toBe("Salle de bain");
    expect(jobType("Isolation des combles perdus")).toBe("Isolation");
    expect(jobType("Réfection toiture")).toBe("Toiture et charpente");
    expect(jobType("Ravalement de façade")).toBe("Extérieurs");
    expect(jobType("Dépannage")).toBe("Autres travaux");
  });

  it("additionne et trie par marge", () => {
    const j = (p: Partial<JobProfit>): JobProfit => ({
      jobId: "x",
      title: "",
      customerId: null,
      customerName: "",
      type: "",
      status: "en_cours",
      soldCents: 0,
      laborCents: 0,
      purchasesCents: 0,
      ...p,
    });
    const g = groupProfits(
      [j({ type: "A", soldCents: 1000, purchasesCents: 400 }), j({ type: "A", soldCents: 1000, laborCents: 100 }), j({ type: "B", laborCents: 50 })],
      (x) => [x.type, x.type],
    );
    expect(g).toEqual([
      { key: "A", label: "A", jobs: 2, soldCents: 2000, costCents: 500, marginCents: 1500, marginBp: 7500 },
      { key: "B", label: "B", jobs: 1, soldCents: 0, costCents: 50, marginCents: -50, marginBp: null },
    ]);
  });
});

describe("rentabilité des chantiers", () => {
  it("vendu au devis et achats réels, par client, type et nature", async () => {
    const claire = await makeCustomer(ctx);
    const j1 = await job("Salle de bain Dubois", claire, [line({ unitPrice: "30" }), line({ nature: "materiau", label: "Faïence", unitPrice: "20" })]);
    await job("Isolation combles", claire, [line({ unitPrice: "10" })]);
    await addPurchase(ctx, j1, { date: "2026-10-12", label: "Faïence", category: "materiau", amount: "300" });

    const r = await profitability(ctx);
    expect(r.jobs).toHaveLength(2);
    const sdb = r.jobs.find((j) => j.jobId === j1)!;
    expect(sdb).toMatchObject({ type: "Salle de bain", soldCents: 100000, purchasesCents: 30000, laborCents: 0 });
    expect(r.natures).toEqual([
      { nature: "main_oeuvre", soldCents: 80000, costCents: 0 },
      { nature: "materiau", soldCents: 40000, costCents: 30000 },
    ]);
    expect(groupProfits(r.jobs, (j) => [j.customerId ?? "", j.customerName])).toHaveLength(1);
    expect((await profitability(ctx, { since: "2099-01-01" })).jobs).toEqual([]);
    const worker = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(profitability(worker)).rejects.toMatchObject({ status: 403 });
  });
});
