import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { isFree, propose, workingDaysFrom } from "@/lib/auto-planning";
import { addAbsence } from "@/lib/services/absences";
import { applyProposal, planningDefaults, proposeForJob } from "@/lib/services/auto-planning";
import type { Ctx } from "@/lib/services/context";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("règles de planification", () => {
  it("compte les jours ouvrés hors week-ends et fériés", () => {
    // Vendredi 30 octobre 2026, puis lundi 2 novembre (le 1er est un dimanche férié).
    expect(workingDaysFrom("2026-10-30", 3)).toEqual(["2026-10-30", "2026-11-02", "2026-11-03"]);
    // Le 11 novembre 2026 tombe un mercredi.
    expect(workingDaysFrom("2026-11-10", 2)).toEqual(["2026-11-10", "2026-11-12"]);
    expect(isFree([{ start: "2026-11-03", end: "2026-11-04" }], ["2026-11-02", "2026-11-03"])).toBe(false);
  });

  it("trouve la première période libre et préfère les plus proches", () => {
    const site = { lat: 45.76, lng: 4.84 };
    const people = [
      { id: "a", name: "Ali", skills: ["carreleur"], busy: [{ start: "2026-11-02", end: "2026-11-04" }], from: site },
      { id: "b", name: "Bea", skills: ["carreleur", "habilitation électrique b1v"], busy: [], from: { lat: 46.2, lng: 5.2 } },
      { id: "c", name: "Cyril", skills: ["peintre"], busy: [], from: site },
    ];
    const p = propose(people, { days: 2, crew: 2, skill: "carreleur", from: "2026-11-02" }, site);
    expect(p).toMatchObject({ start: "2026-11-05", end: "2026-11-06", skipped: 0 });
    expect(p?.crew.map((c) => c.id)).toEqual(["a", "b"]);
    expect(propose(people, { days: 1, crew: 1, skill: "", from: "2026-11-02" }, site)?.crew[0].id).toBe("c");
    expect(propose(people, { days: 1, crew: 1, skill: "électrique", from: "2026-11-02" }, site)?.crew[0].id).toBe("b");
    expect(propose(people, { days: 1, crew: 3, skill: "carreleur", from: "2026-11-02" }, site)).toBeNull();
  });
});

describe("planification d'un chantier", () => {
  let db: Database;
  let ctx: Ctx;
  let job: string;
  let worker: string;

  beforeAll(async () => {
    db = await freshDb();
    const owner = await signUp(db, "auto-planning@exemple.fr");
    ctx = { ...owner, entitlements: { ...owner.entitlements, plan: { ...owner.entitlements.plan, maxUsers: 10 } } };
    await completeProfile(ctx);
    worker = (await signUp(db, "auto-ouvrier@exemple.fr", "Ouvrier")).userId;
    await db.query("INSERT INTO memberships (org_id, user_id, role, job_function, qualification) VALUES ($1,$2,'member','ouvrier','Carreleur')", [
      ctx.orgId,
      worker,
    ]);
    job = (await db.query<{ id: string }>("INSERT INTO jobs (org_id, title) VALUES ($1,'Douche italienne') RETURNING id", [ctx.orgId]))[0].id;
    await addAbsence(ctx, { userId: worker, kind: "conges", start: "2026-11-02", end: "2026-11-06" });
  });

  it("propose puis enregistre la période en tenant compte des absences", async () => {
    expect(await planningDefaults(ctx, job, "2026-10-30")).toEqual({ days: 1, crew: 1, skill: "", from: "2026-11-02" });
    const r = await proposeForJob(ctx, job, { days: "2", crew: "1", skill: "carrel", from: "2026-11-02" });
    expect(r.proposal).toMatchObject({ start: "2026-11-09", end: "2026-11-10", crew: [{ id: worker }] });
    await expect(proposeForJob(ctx, job, { days: "0", crew: "1", from: "2026-11-02" })).rejects.toMatchObject({ status: 400 });
    const done = await applyProposal(ctx, job, r.proposal!.start, r.proposal!.end, [worker]);
    expect(done).toEqual({ assigned: 1, conflicts: [] });
    const other = (await db.query<{ id: string }>("INSERT INTO jobs (org_id, title) VALUES ($1,'Crédence') RETURNING id", [ctx.orgId]))[0].id;
    const next = await proposeForJob(ctx, other, { days: "1", crew: "1", skill: "carrel", from: "2026-11-09" });
    expect(next.proposal?.start).toBe("2026-11-12");
  });
});
