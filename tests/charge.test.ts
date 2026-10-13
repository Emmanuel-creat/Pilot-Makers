import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { addAbsence } from "@/lib/services/absences";
import { createJobFromQuote } from "@/lib/services/jobs";
import { mondayOf } from "@/lib/services/planning-dates";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { workload } from "@/lib/services/workload";
import { forecast, peaks, remainingLabourDays, seasonality } from "@/lib/workload";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let mate: Ctx;
const NOW = new Date("2026-10-14T10:00:00Z"); // mercredi
const MONDAY = "2026-10-12";

async function job(lines: Record<string, unknown>[]) {
  const qid = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, qid);
  await saveDraft(ctx, qid, { ...d, title: "Rénovation", sections: [{ ...d.sections[0], lines: lines.map((l) => line(l)) }] }, d.draftRevision);
  await issueQuote(ctx, qid);
  await recordResponseManually(ctx, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  return createJobFromQuote(ctx, qid);
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "charge@exemple.fr");
  await completeProfile(ctx);
  const m = await signUp(db, "charge-ouvrier@exemple.fr", "Ouvrier");
  await db.query("INSERT INTO memberships (org_id, user_id, role, job_function) VALUES ($1,$2,'member','ouvrier')", [ctx.orgId, m.userId]);
  mate = { ...m, orgId: ctx.orgId, role: "member", jobFunction: "ouvrier" } as Ctx;
});

describe("calculs de charge", () => {
  it("dégage l'indice saisonnier à partir de douze mois", () => {
    const rows = Array.from({ length: 24 }, (_, i) => {
      const month = `${2024 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
      return { month, signedHtCents: (i % 12) + 1 === 6 ? 300000 : (i % 12) + 1 === 12 ? 50000 : 100000 };
    });
    const idx = seasonality(rows);
    expect(idx[5]).toBe(Math.round((300000 / ((300000 + 50000 + 10 * 100000) / 12)) * 100));
    expect(peaks(idx)).toEqual({ high: ["Juin"], low: ["Décembre"] });
    expect(seasonality(rows.slice(0, 11)).every((v) => v === null)).toBe(true);
  });

  it("convertit la main-d'œuvre restante en jours", () => {
    expect(
      remainingLabourDays([
        { nature: "main_oeuvre", quantity: "35", unit: "h", progressBp: 0 },
        { nature: "main_oeuvre", quantity: "4", unit: "j", progressBp: 5000 },
        { nature: "main_oeuvre", quantity: "20", unit: "m²", progressBp: 0 },
        { nature: "materiau", quantity: "10", unit: "h", progressBp: 0 },
      ]),
    ).toBe(7);
  });

  it("place le reste à faire dans les semaines libres", () => {
    const f = forecast(
      [
        { monday: "2026-10-12", capacityDays: 10, plannedDays: 8 },
        { monday: "2026-10-19", capacityDays: 10, plannedDays: 2 },
        { monday: "2026-10-26", capacityDays: 0, plannedDays: 0 },
      ],
      12,
    );
    expect(f.weeks.map((w) => w.backlogDays)).toEqual([2, 8, 0]);
    expect(f.weeks.map((w) => w.loadPercent)).toEqual([100, 100, null]);
    expect(f.overflowDays).toBe(2);
    expect(f.firstFree).toBeNull();
    expect(forecast([{ monday: "2026-10-12", capacityDays: 10, plannedDays: 2 }], 1).firstFree).toBe("2026-10-12");
  });
});

describe("prévision de l'entreprise", () => {
  it("compte capacité, absences, planning et chantiers à planifier", async () => {
    const planned = await job([{ quantity: "10", unit: "h" }]);
    await db.query(
      "INSERT INTO job_assignments (org_id, job_id, resource_type, resource_id, start_date, end_date) VALUES ($1,$2,'user',$3,'2026-10-12','2026-10-14')",
      [ctx.orgId, planned, mate.userId],
    );
    await addAbsence(ctx, { userId: mate.userId, kind: "conges", start: "2026-10-16", end: "2026-10-16" });
    const todo = await job([
      { quantity: "14", unit: "h" },
      { quantity: "3", unit: "j" },
      { nature: "materiau", quantity: "5", unit: "u" },
    ]);
    const w = await workload(ctx, NOW);
    expect(w.team).toBe(2);
    expect(w.weeks).toHaveLength(12);
    expect(w.weeks[0]).toMatchObject({ monday: MONDAY, capacityDays: 9, plannedDays: 3, backlogDays: 5, loadPercent: 89 });
    expect(w.weeks[1]).toMatchObject({ capacityDays: 10, plannedDays: 0, backlogDays: 0 });
    expect(w.backlog.jobs.map((j) => j.id)).toEqual([todo]);
    expect(w.backlog.days).toBe(5);
    expect(w.firstFree).toBe(mondayOf("2026-10-19"));
    expect(w.monthsObserved).toBeLessThan(12);
    await expect(workload(mate, NOW)).rejects.toMatchObject({ status: 403 });
  });
});
