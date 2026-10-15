import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { exposure, portfolio, type JobMoney } from "@/lib/unpaid-exposure";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice } from "@/lib/services/invoices";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { unpaidExposure } from "@/lib/services/unpaid-exposure";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const job = (o: Partial<JobMoney>): JobMoney => ({
  jobId: "j",
  title: "Chantier",
  customer: "Client",
  quoteId: "q",
  totalTtcCents: 2_000_000,
  progressBp: 0,
  invoicedTtcCents: 0,
  paidTtcCents: 0,
  hasStages: false,
  stagesWaiting: 0,
  ...o,
});

describe("avance consentie au client", () => {
  it("rien à signaler tant que l'avance reste faible", () => {
    expect(exposure(job({ progressBp: 500 })).level).toBe("ok");
    expect(exposure(job({ totalTtcCents: 40_000, progressBp: 10000 })).level).toBe("ok");
    expect(exposure(job({ progressBp: 6000, paidTtcCents: 1_100_000 })).level).toBe("ok");
  });

  it("à surveiller puis à risque, avec des conseils concrets", () => {
    const w = exposure(job({ progressBp: 2000 }));
    expect(w).toMatchObject({ doneValueCents: 400_000, exposureCents: 400_000, level: "surveiller" });
    expect(w.advice[0]).toMatch(/étapes validées/);
    const r = exposure(job({ progressBp: 7000, invoicedTtcCents: 600_000, paidTtcCents: 0, hasStages: true, stagesWaiting: 1 }));
    expect(r.level).toBe("risque");
    expect(r.advice.join(" ")).toMatch(/attend la validation/);
    expect(r.advice.join(" ")).toMatch(/situation de travaux/);
    expect(r.advice.join(" ")).toMatch(/Relancez les factures/);
    expect(r.advice.join(" ")).toMatch(/suspendre/);
    expect(r.advice.join(" ")).not.toMatch(/Proposez/);
  });

  it("synthèse triée par avance décroissante", () => {
    const p = portfolio([job({ jobId: "a", progressBp: 2000 }), job({ jobId: "b", progressBp: 8000, hasStages: true })]);
    expect(p.jobs.map((j) => j.jobId)).toEqual(["b", "a"]);
    expect(p.totalExposureCents).toBe(2_000_000);
    expect([p.atRisk, p.toWatch, p.stagesCoverage]).toEqual([1, 1, 50]);
    expect(portfolio([]).stagesCoverage).toBeNull();
  });
});

describe("chantiers de l'entreprise", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "impaye@exemple.fr");
    await completeProfile(ctx);
  });

  it("mesure l'avance d'après l'avancement des tâches et les factures", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      { ...d, title: "Cuisine", sections: [{ ...d.sections[0], lines: [line({ quantity: "100", unitPrice: "100" })] }] },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    const jobId = await createJobFromQuote(ctx, id);
    await db.query("UPDATE jobs SET status='en_cours' WHERE id=$1", [jobId]);
    await db.query("UPDATE job_tasks SET progress_bp=5000 WHERE job_id=$1", [jobId]);
    let p = await unpaidExposure(ctx);
    expect(p.jobs).toHaveLength(1);
    expect(p.jobs[0]).toMatchObject({ progressBp: 5000, doneValueCents: 550_000, exposureCents: 550_000, level: "risque" });
    await createFinalInvoice(ctx, id);
    p = await unpaidExposure(ctx);
    expect(p.jobs[0]).toMatchObject({ invoicedTtcCents: 1_100_000, uninvoicedCents: 0 });
    await expect(unpaidExposure({ ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx)).rejects.toThrow();
  });
});
