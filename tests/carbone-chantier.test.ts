import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { carKmEquivalent, jobCarbon, wasteGrams } from "@/lib/job-carbon";
import type { Ctx } from "@/lib/services/context";
import { jobCarbonReport, setJobCarbonSettings } from "@/lib/services/job-carbon";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, parisDate, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { addJobWaste } from "@/lib/services/waste";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("calcul du bilan carbone", () => {
  it("additionne produits, trajets et déchets, et propose des leviers", () => {
    const r = jobCarbon({
      materialsGrams: 500_000,
      materialsEstimatedGrams: 500_000,
      tripKm: 30,
      trips: 10,
      vehicle: "utilitaire_diesel",
      waste: [{ category: "melange", tonnes: 2, sorted: false }],
    });
    expect(r.travel).toMatchObject({ grams: 81_000, km: 300 });
    expect(r.waste.grams).toBe(400_000);
    expect(r.totalGrams).toBe(981_000);
    expect(r.materials.share + r.travel.share + r.waste.share).toBe(100);
    expect(r.levers.map((l) => l.key)).toEqual(["tri", "biosource", "vehicule", "trajets"]);
    expect(r.levers.find((l) => l.key === "tri")?.savingGrams).toBe(320_000);
    expect(r.levers.find((l) => l.key === "trajets")?.savingGrams).toBe(2 * 30 * 270);
    expect(wasteGrams({ category: "gravats", tonnes: 3, sorted: true })).toBe(15_000);
    expect(wasteGrams({ category: "inconnue", tonnes: null, sorted: false })).toBe(0);
    expect(carKmEquivalent(981_000)).toBe(4905);
  });

  it("ne propose rien d'inutile sans véhicule ni déchets", () => {
    const r = jobCarbon({ materialsGrams: 0, materialsEstimatedGrams: 0, tripKm: 10, trips: 5, vehicle: "aucun", waste: [] });
    expect(r.totalGrams).toBe(0);
    expect(r.levers).toEqual([]);
  });
});

describe("bilan carbone d'un chantier", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "carbone@chantier.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Fenêtres",
        site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" },
        sections: [{ ...d.sections[0], lines: [line({ label: "Fenêtre PVC double vitrage", unit: "u", quantity: "3", nature: "materiau" })] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    jobId = await createJobFromQuote(ctx, id);
  });

  it("calcule les produits du devis et les déchets, puis les déplacements une fois la distance connue", async () => {
    await addJobWaste(ctx, jobId, { date: parisDate(new Date()), category: "melange", quantity: "0,5", unit: "t", sorted: false });
    let r = await jobCarbonReport(ctx, jobId);
    expect(r.materials.grams).toBe(300_000);
    expect(r.waste.grams).toBe(100_000);
    expect(r.travel.grams).toBe(0);
    await expect(setJobCarbonSettings(ctx, jobId, { tripKm: "-3" })).rejects.toThrow(/Distance/);
    await setJobCarbonSettings(ctx, jobId, { tripKm: "24,5", vehicle: "utilitaire_electrique", trips: "4" });
    r = await jobCarbonReport(ctx, jobId);
    expect(r.settings).toMatchObject({ tripKm: 24.5, vehicle: "utilitaire_electrique", trips: 4 });
    expect(r.travel.grams).toBe(Math.round(24.5 * 4 * 60));
    expect(r.levers.some((l) => l.key === "vehicule")).toBe(false);
    await expect(jobCarbonReport(await signUp(db, "autre@chantier.fr", "Autre"), jobId)).rejects.toMatchObject({ status: 404 });
  });
});
