import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { addEntry } from "@/lib/services/timesheets";
import { getTravelRates, saveTravelRates, travelAllowances } from "@/lib/services/travel";
import { dayAllowance, EMPTY_RATES, hasRates, monthAllowance, readRates, zoneFor, zoneLabel, type TravelRates } from "@/lib/travel";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
const NOW = new Date("2026-10-20T12:00:00Z");

const rates: TravelRates = {
  meal: 1100,
  grand: 7500,
  zones: [
    { transport: 100, trip: 50 },
    { transport: 300, trip: 150 },
    { transport: 500, trip: 250 },
    { transport: 700, trip: 350 },
    { transport: 900, trip: 450 },
  ],
};

async function jobAt(lat: number, lng: number) {
  const qid = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, qid);
  await saveDraft(ctx, qid, { ...d, title: "Carrelage", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  await issueQuote(ctx, qid);
  await recordResponseManually(ctx, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  const id = await createJobFromQuote(ctx, qid);
  await db.query("UPDATE jobs SET latitude=$2, longitude=$3 WHERE id=$1", [id, lat, lng]);
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "deplacements@exemple.fr");
  await completeProfile(ctx);
});

describe("zones et indemnités", () => {
  it("classe la distance en zones de 10 km, grand déplacement au-delà de 50 km", () => {
    expect(zoneFor(null)).toBeNull();
    expect(zoneFor(0)).toBe(1);
    expect(zoneFor(10)).toBe(1);
    expect(zoneFor(10.1)).toBe(2);
    expect(zoneFor(50)).toBe(5);
    expect(zoneFor(50.2)).toBe("grand");
    expect(zoneLabel(3)).toBe("Zone 3 (20 à 30 km)");
  });

  it("additionne repas, transport et trajet, ou l'indemnité de grand déplacement", () => {
    expect(dayAllowance(2, rates)).toEqual({ meal: 1100, transport: 300, trip: 150, grand: 0, total: 1550 });
    expect(dayAllowance("grand", rates)).toEqual({ meal: 0, transport: 0, trip: 0, grand: 7500, total: 7500 });
    const m = monthAllowance([1, 2, 2, "grand", null], rates);
    expect(m).toMatchObject({ zoneDays: [1, 2, 0, 0, 0], grandDays: 1, unknownDays: 1, total: 1250 + 1550 * 2 + 7500 });
  });

  it("relit un barème enregistré en ignorant les valeurs invalides", () => {
    expect(readRates(null)).toEqual(EMPTY_RATES);
    expect(hasRates(EMPTY_RATES)).toBe(false);
    expect(readRates({ meal: 1000, grand: -5, zones: [{ transport: 1.5, trip: 20 }] })).toMatchObject({
      meal: 1000,
      grand: 0,
      zones: [{ transport: 0, trip: 20 }, {}, {}, {}, {}],
    });
  });
});

describe("indemnités du mois", () => {
  it("calcule la zone du chantier principal de chaque jour validé", async () => {
    await expect(saveTravelRates(ctx, { meal: "abc" })).rejects.toThrow();
    await saveTravelRates(ctx, {
      meal: "11",
      grand: "75",
      transport1: "1",
      trip1: "0,50",
      transport2: "3",
      trip2: "1,50",
    });
    expect((await getTravelRates(ctx)).zones[1]).toEqual({ transport: 300, trip: 150 });

    let month = await travelAllowances(ctx, "2026-10");
    expect(month.originKnown).toBe(false);

    await db.query("UPDATE organizations SET latitude=45.764, longitude=4.8357 WHERE id=$1", [ctx.orgId]);
    const near = await jobAt(45.899, 4.8357); // 15 km au nord
    const far = await jobAt(46.394, 4.8357); // 70 km au nord
    await addEntry(ctx, { jobId: near, date: "2026-10-12", duration: "8" }, NOW);
    await addEntry(ctx, { jobId: near, date: "2026-10-13", duration: "3" }, NOW);
    await addEntry(ctx, { jobId: far, date: "2026-10-13", duration: "5" }, NOW);
    await addEntry(ctx, { date: "2026-10-14", duration: "7" }, NOW);
    await addEntry(ctx, { jobId: near, date: "2026-10-15", duration: "7" }, NOW); // non validé
    await db.query("UPDATE time_entries SET status='valide' WHERE org_id=$1 AND work_date < '2026-10-15'", [ctx.orgId]);

    month = await travelAllowances(ctx, "2026-10");
    expect(month.originKnown).toBe(true);
    expect(month.rows).toHaveLength(1);
    expect(month.rows[0]).toMatchObject({ zoneDays: [0, 1, 0, 0, 0], grandDays: 1, unknownDays: 1, total: 1550 + 7500 });
    expect((await travelAllowances(ctx, "2026-09")).rows).toHaveLength(0);
    await expect(travelAllowances(ctx, "octobre")).rejects.toThrow("Mois invalide");
  });
});
