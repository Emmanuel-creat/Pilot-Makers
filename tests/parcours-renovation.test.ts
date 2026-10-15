import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { DiagnosisInput } from "@/lib/energy-diagnosis";
import { buildJourney, readAidSteps, type JourneyFacts } from "@/lib/energy-journey";
import type { Ctx } from "@/lib/services/context";
import { energyJourney, quoteFromDiagnosis, saveDiagnosis, setAidStep } from "@/lib/services/energy-diagnoses";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

const FACTS: JourneyFacts = {
  diagnosedOn: "2026-09-01",
  quoteNumber: "D-2026-001",
  quoteIssuedOn: "2026-09-03",
  acceptedOn: null,
  jobStatus: null,
  jobStartOn: null,
  receptionOn: null,
  finalInvoiceOn: null,
  estimatedAid: 7500,
};

describe("parcours de rénovation : étapes", () => {
  it("coche seules les étapes de l'application et propose la suivante", () => {
    const j = buildJourney(FACTS, {}, "2026-10-15");
    expect(j.total).toBe(11);
    expect(j.done).toBe(2);
    expect(j.next?.key).toBe("aide_compte");
    expect(j.alerts).toEqual([]);
    expect(j.aid).toEqual({ estimatedCents: 750000, grantedCents: null, receivedCents: null, gapCents: null });
  });

  it("alerte si les travaux commencent avant le dépôt de la demande d'aide", () => {
    const started = buildJourney({ ...FACTS, acceptedOn: "2026-09-10", jobStartOn: "2026-10-01" }, {}, "2026-10-15");
    expect(started.stages.find((s) => s.key === "travaux")).toMatchObject({ done: true, on: "2026-10-01" });
    expect(started.alerts[0]).toMatch(/sans demande d'aide déposée/);
    const late = buildJourney({ ...FACTS, jobStartOn: "2026-10-01" }, { aide_depot: { on: "2026-10-05" } }, "2026-10-15");
    expect(late.alerts[0]).toMatch(/après le début des travaux/);
    const planned = buildJourney({ ...FACTS, jobStartOn: "2026-11-01" }, {}, "2026-10-15");
    expect(planned.stages.find((s) => s.key === "travaux")?.done).toBe(false);
    expect(planned.alerts).toEqual([]);
  });

  it("rappelle la demande de versement et suit l'écart entre aide accordée et versée", () => {
    const j = buildJourney(
      { ...FACTS, finalInvoiceOn: "2026-10-10" },
      { aide_accord: { on: "2026-09-20", amountCents: 700000 }, aide_versee: { on: "2026-10-14", amountCents: 650000 } },
      "2026-10-15",
    );
    expect(j.alerts).toEqual(["La facture finale est émise : envoyez la demande de versement de l'aide avec la facture."]);
    expect(j.aid).toMatchObject({ grantedCents: 700000, receivedCents: 650000, gapCents: 50000 });
    expect(readAidSteps({ aide_depot: { on: "2026-10-01" }, inconnu: { on: "2026-10-01" }, aide_accord: { on: "hier" } })).toEqual({
      aide_depot: { on: "2026-10-01" },
    });
  });
});

describe("parcours de rénovation : en base", () => {
  let db: Database;
  let ctx: Ctx;
  let id: string;
  const input: DiagnosisInput = {
    housing: "maison",
    surface: 100,
    period: "1948_1974",
    postalCode: "69003",
    heating: "fioul",
    roof: "non",
    walls: "non",
    floor: "non",
    windows: "simple",
    ventilation: "naturelle",
    householdSize: 3,
    income: 28000,
  };

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "parcours@exemple.fr");
    await completeProfile(ctx);
    id = await saveDiagnosis(ctx, input, await makeCustomer(ctx));
  });

  it("relie le diagnostic, le devis et les étapes du dossier d'aide", async () => {
    let j = await energyJourney(ctx, id);
    expect(j.done).toBe(1);
    expect(j.next?.key).toBe("devis");
    const quoteId = await quoteFromDiagnosis(ctx, id, ["toiture", "pac"]);
    await db.query("UPDATE quotes SET issued_at=now() WHERE id=$1", [quoteId]);
    j = await energyJourney(ctx, id);
    expect(j.done).toBe(2);
    expect(j.aid.estimatedCents).toBe(750000);
    await setAidStep(ctx, id, "aide_compte", { on: "2026-10-01" });
    await setAidStep(ctx, id, "aide_accord", { on: "2026-10-02", amountCents: 720000, note: "Dossier MPR-123" });
    j = await energyJourney(ctx, id);
    expect(j.done).toBe(4);
    expect(j.next?.key).toBe("aide_depot");
    expect(j.stages.find((s) => s.key === "aide_accord")).toMatchObject({ done: true, amountCents: 720000, note: "Dossier MPR-123" });
    await setAidStep(ctx, id, "aide_compte", null);
    expect((await energyJourney(ctx, id)).done).toBe(3);
    await expect(setAidStep(ctx, id, "inconnu", { on: "2026-10-01" })).rejects.toMatchObject({ status: 400 });
    await expect(setAidStep(ctx, id, "aide_depot", { on: "2999-01-01" })).rejects.toThrow(/futur/);
    const other = await signUp(db, "autre-parcours@exemple.fr", "Autre");
    await expect(energyJourney(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(setAidStep(other, id, "aide_depot", { on: "2026-10-01" })).rejects.toMatchObject({ status: 404 });
  });
});
