import { beforeAll, describe, expect, it } from "vitest";
import { personLoads, spread, suggestions, workingDays, type BalancePerson } from "@/lib/balance";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { teamBalance } from "@/lib/services/balance";
import { assign, moveAssignment } from "@/lib/services/planning";
import { completeProfile, freshDb, signUp } from "./helpers";

const DAYS = workingDays("2026-10-19", "2026-10-30");
const person = (id: string, absent: string[] = []): BalancePerson => ({ id, name: id.toUpperCase(), absent: new Set(absent) });

describe("calcul de l'équilibre", () => {
  it("compte les jours ouvrés seulement", () => {
    expect(DAYS).toHaveLength(10);
    expect(DAYS[0]).toBe("2026-10-19");
    expect(DAYS.includes("2026-10-24")).toBe(false);
  });

  it("signale doubles affectations, travail pendant une absence et planning plein", () => {
    const loads = personLoads(
      DAYS,
      [person("a"), person("b", ["2026-10-19"]), person("c")],
      [
        { id: "1", jobTitle: "Toiture", userId: "a", start: "2026-10-19", end: "2026-10-30" },
        { id: "2", jobTitle: "Cuisine", userId: "a", start: "2026-10-20", end: "2026-10-21" },
        { id: "3", jobTitle: "Salle de bains", userId: "b", start: "2026-10-19", end: "2026-10-20" },
      ],
    );
    const [a, b, c] = loads;
    expect(a).toMatchObject({ plannedDays: 10, capacityDays: 10, doubleDays: 2, status: "surcharge", longestStreak: 10 });
    expect(a.reasons).toContain("planning plein");
    expect(b).toMatchObject({ capacityDays: 9, plannedDays: 1, absentBusyDays: 1, status: "surcharge" });
    expect(c).toMatchObject({ rate: 0, status: "disponible", reasons: [] });
    expect(spread(loads)).toBe(1);
  });

  it("propose de confier une affectation à la personne libre la moins chargée", () => {
    const people = [person("a"), person("b"), person("c", ["2026-10-21"])];
    const s = suggestions(
      DAYS,
      people,
      [
        { id: "1", jobTitle: "Toiture", userId: "a", start: "2026-10-19", end: "2026-10-30" },
        { id: "2", jobTitle: "Cuisine", userId: "a", start: "2026-10-20", end: "2026-10-21" },
        { id: "3", jobTitle: "Peinture", userId: "b", start: "2026-10-26", end: "2026-10-27" },
      ],
      "2026-10-19",
    );
    // c est absent le 21 : seule b peut reprendre la cuisine, l'affectation en double passe en premier.
    expect(s[0]).toMatchObject({ assignmentId: "2", fromId: "a", toId: "b", days: 2 });
    expect(s.some((x) => x.assignmentId === "1")).toBe(false);
  });

  it("ne propose rien sans surcharge", () => {
    expect(
      suggestions(DAYS, [person("a"), person("b")], [{ id: "1", jobTitle: "X", userId: "a", start: "2026-10-19", end: "2026-10-20" }], "2026-10-19"),
    ).toEqual([]);
  });
});

describe("équilibre de l'équipe", () => {
  let db: Database;
  let ctx: Ctx;
  let mateId: string;
  const NOW = new Date("2026-10-16T10:00:00Z");

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "equilibre@exemple.fr");
    await completeProfile(ctx);
    const m = await signUp(db, "equilibre-ouvrier@exemple.fr", "Ouvrier");
    mateId = m.userId;
    await db.query("INSERT INTO memberships (org_id, user_id, role, job_function) VALUES ($1,$2,'member','ouvrier')", [ctx.orgId, mateId]);
  });

  it("repère la surcharge puis l'applique via le déplacement du planning", async () => {
    const jobs = [];
    for (const t of ["Toiture", "Cuisine"]) {
      const r = await db.query<{ id: string }>("INSERT INTO jobs (org_id, title, status) VALUES ($1,$2,'a_planifier') RETURNING id", [ctx.orgId, t]);
      jobs.push(r[0].id);
    }
    await assign(ctx, { jobId: jobs[0], resourceType: "user", resourceId: ctx.userId, start: "2026-10-19", end: "2026-10-23" });
    await assign(ctx, { jobId: jobs[1], resourceType: "user", resourceId: ctx.userId, start: "2026-10-21", end: "2026-10-22" });
    const b = await teamBalance(ctx, NOW);
    const me = b.loads.find((l) => l.id === ctx.userId)!;
    expect(me.status).toBe("surcharge");
    expect(me.doubleDays).toBe(2);
    expect(b.suggestions[0]).toMatchObject({ toId: mateId, start: "2026-10-19" });
    const s = b.suggestions[0];
    await moveAssignment(ctx, s.assignmentId, { resourceType: "user", resourceId: s.toId, start: s.start });
    const after = await teamBalance(ctx, NOW);
    expect(after.loads.find((l) => l.id === ctx.userId)!.doubleDays).toBe(0);
    expect(after.overloaded).toBe(0);
  });

  it("est réservé à la gestion de l'équipe", async () => {
    await expect(teamBalance({ ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx, NOW)).rejects.toThrow();
  });
});
