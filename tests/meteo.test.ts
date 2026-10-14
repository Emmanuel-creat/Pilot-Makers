import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { assign } from "@/lib/services/planning";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { setOutdoorWork, shiftJob, weatherBoard } from "@/lib/services/weather";
import { checkJob, dayRisks, demoForecast, parseOpenMeteo, type DayForecast } from "@/lib/weather";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const day = (date: string, p: Partial<DayForecast> = {}): DayForecast => ({ date, tMin: 8, tMax: 16, rainMm: 0, rainProb: 10, gustKmh: 20, ...p });

describe("météo des chantiers", () => {
  it("applique les seuils du type de travaux", () => {
    expect(dayRisks(day("2026-10-15", { tMin: 1 }), "maconnerie")).toEqual(["1 °C au plus froid"]);
    expect(dayRisks(day("2026-10-15", { tMin: 1 }), "general")).toEqual([]);
    expect(dayRisks(day("2026-10-15", { gustKmh: 55 }), "toiture")).toEqual(["rafales 55 km/h"]);
    expect(dayRisks(day("2026-10-15", { rainMm: 1.5, rainProb: 40 }), "peinture")).toEqual(["pluie 1,5 mm (40 %)"]);
  });

  it("propose la première période sèche de même durée", () => {
    // Jeudi 15 et vendredi 16 planifiés, pluie le 16 ; lundi 19 et mardi 20 secs.
    const f = [day("2026-10-15"), day("2026-10-16", { rainMm: 12, rainProb: 90 }), day("2026-10-17"), day("2026-10-18"), day("2026-10-19"), day("2026-10-20")];
    const c = checkJob(["2026-10-15", "2026-10-16"], f, "general", "2026-10-15");
    expect(c.risky).toBe(1);
    expect(c.proposal).toEqual({ start: "2026-10-19", days: ["2026-10-19", "2026-10-20"], shift: 4 });
    expect(checkJob(["2026-10-15"], f, "general", "2026-10-15").proposal).toBeNull();
    expect(checkJob(["2026-10-16", "2026-10-19", "2026-10-20"], f.slice(0, 5), "general", "2026-10-15").proposal).toBeNull();
  });

  it("lit Open-Meteo et fournit une prévision de démonstration", () => {
    const f = parseOpenMeteo({
      daily: {
        time: ["2026-10-15", "bad"],
        temperature_2m_min: [3.2, 1],
        temperature_2m_max: [12, 1],
        precipitation_sum: [4.1, null],
        precipitation_probability_max: [75, 0],
        wind_gusts_10m_max: [41, 0],
      },
    });
    expect(f).toEqual([{ date: "2026-10-15", tMin: 3.2, tMax: 12, rainMm: 4.1, rainProb: 75, gustKmh: 41 }]);
    expect(parseOpenMeteo(null)).toEqual([]);
    const demo = demoForecast("2026-10-14");
    expect(demo).toHaveLength(10);
    expect(demo.some((d) => d.rainMm > 0)).toBe(true);
  });
});

describe("météo et planning", () => {
  let db: Database;
  let ctx: Ctx;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "meteo@exemple.fr");
    await completeProfile(ctx);
  });

  it("signale la pluie sur un chantier extérieur et le décale", async () => {
    const q = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, q);
    await saveDraft(ctx, q, { ...d, title: "Enduit de façade", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
    await issueQuote(ctx, q);
    await recordResponseManually(ctx, q, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    const job = await createJobFromQuote(ctx, q);
    await db.query("UPDATE jobs SET latitude=45.76, longitude=4.84 WHERE id=$1", [job]);
    await assign(ctx, { jobId: job, resourceType: "user", resourceId: ctx.userId, start: "2026-10-15", end: "2026-10-16" });
    await expect(setOutdoorWork(ctx, job, "piscine")).rejects.toMatchObject({ status: 400 });
    await setOutdoorWork(ctx, job, "maconnerie");

    let calls = 0;
    const time = ["2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"];
    const fetcher = async () => {
      calls++;
      return new Response(
        JSON.stringify({
          daily: {
            time,
            temperature_2m_min: [8, 8, 8, 8, 8, 8],
            temperature_2m_max: [15, 15, 15, 15, 15, 15],
            precipitation_sum: [0, 9, 0, 0, 0, 0],
            precipitation_probability_max: [10, 90, 10, 10, 10, 10],
            wind_gusts_10m_max: [20, 20, 20, 20, 20, 20],
          },
        }),
      );
    };
    const now = new Date("2026-10-15T08:00:00Z");
    const b = await weatherBoard(ctx, now, fetcher);
    const j = b.jobs.find((x) => x.id === job)!;
    expect(j.kindLabel).toBe("Maçonnerie, béton, enduits");
    expect(j.check?.risky).toBe(1);
    expect(j.check?.proposal).toMatchObject({ start: "2026-10-19", shift: 4 });
    await weatherBoard(ctx, now, fetcher);
    expect(calls).toBe(1);

    expect(await shiftJob(ctx, { jobId: job, shift: "4" }, now)).toEqual({ moved: 1, conflicts: 0 });
    const a = await db.query<{ s: string; e: string }>(
      "SELECT to_char(start_date, 'YYYY-MM-DD') AS s, to_char(end_date, 'YYYY-MM-DD') AS e FROM job_assignments WHERE job_id=$1",
      [job],
    );
    expect(a).toEqual([{ s: "2026-10-19", e: "2026-10-20" }]);
    expect((await weatherBoard(ctx, now, fetcher)).jobs[0].check?.risky).toBe(0);
    await expect(shiftJob(ctx, { jobId: job, shift: "0" }, now)).rejects.toMatchObject({ status: 400 });
  });
});
