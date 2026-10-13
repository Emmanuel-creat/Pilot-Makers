import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote, getJob } from "@/lib/services/jobs";
import { addVehicle, assign, deleteAssignment, deleteVehicle, listResources, moveAssignment, planning } from "@/lib/services/planning";
import { addDays, findConflicts, mondayOf, monthRange, range } from "@/lib/services/planning-dates";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

async function job(title: string) {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    { ...d, title, site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" }, sections: [{ ...d.sections[0], lines: [line()] }] },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  return createJobFromQuote(ctx, id);
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "planning@exemple.fr");
  await completeProfile(ctx);
});

describe("planning", () => {
  it("dates de la semaine et du mois", () => {
    expect(mondayOf("2026-10-15")).toBe("2026-10-12");
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
    expect(monthRange("2026-02-10")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(range("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    const s = (id: string, jobId: string, start: string, end: string) => ({ id, jobId, resourceType: "user" as const, resourceId: "u", start, end });
    expect(
      [
        ...findConflicts([
          s("a", "j1", "2026-10-12", "2026-10-14"),
          s("b", "j2", "2026-10-14", "2026-10-15"),
          s("c", "j3", "2026-10-16", "2026-10-16"),
        ]),
      ].sort(),
    ).toEqual(["a", "b"]);
    expect(findConflicts([s("a", "j1", "2026-10-12", "2026-10-14"), s("b", "j1", "2026-10-13", "2026-10-15")]).size).toBe(0);
  });

  it("affecte équipes et véhicules, signale les conflits, déplace en gardant la durée", async () => {
    const j1 = await job("Cuisine Martin");
    const j2 = await job("Terrasse Durand");
    const van = await addVehicle(ctx, { name: "Fourgon", plate: "ab-123-cd" });
    const resources = await listResources(ctx);
    expect(resources.map((r) => r.type)).toEqual(["user", "vehicle"]);
    expect(resources[1].detail).toBe("AB-123-CD");

    const a1 = await assign(ctx, { jobId: j1, resourceType: "user", resourceId: ctx.userId, start: "2026-11-02", end: "2026-11-04" });
    expect(a1.conflicts).toEqual([]);
    await assign(ctx, { jobId: j1, resourceType: "vehicle", resourceId: van, start: "2026-11-02", end: "2026-11-02" });
    const a2 = await assign(ctx, { jobId: j2, resourceType: "user", resourceId: ctx.userId, start: "2026-11-04", end: "2026-11-05" });
    expect(a2.conflicts).toEqual(["Cuisine Martin"]);
    expect((await getJob(ctx, j1)).job).toMatchObject({ start_date: "2026-11-02", end_date: "2026-11-04" });

    let week = await planning(ctx, "2026-11-02", "2026-11-08");
    expect(
      week
        .filter((s) => s.conflict)
        .map((s) => s.title)
        .sort(),
    ).toEqual(["Cuisine Martin", "Terrasse Durand"]);

    // Glisser la terrasse au vendredi : plus de conflit, durée conservée (2 jours).
    const moved = await moveAssignment(ctx, a2.id, { resourceType: "user", resourceId: ctx.userId, start: "2026-11-06" });
    expect(moved.conflicts).toEqual([]);
    week = await planning(ctx, "2026-11-02", "2026-11-08");
    expect(week.find((s) => s.id === a2.id)).toMatchObject({ start: "2026-11-06", end: "2026-11-07", conflict: false });
    expect((await getJob(ctx, j2)).job).toMatchObject({ start_date: "2026-11-06", end_date: "2026-11-07" });

    await expect(
      assign(ctx, { jobId: j1, resourceType: "user", resourceId: ctx.userId, start: "2026-11-05", end: "2026-11-01" }),
    ).rejects.toMatchObject({
      status: 400,
    });
    const other = await signUp(db, "planning-autre@exemple.fr", "Autre");
    await expect(
      assign(ctx, { jobId: j1, resourceType: "user", resourceId: other.userId, start: "2026-11-05", end: "2026-11-05" }),
    ).rejects.toMatchObject({
      status: 404,
    });
    await expect(moveAssignment(other, a2.id, { resourceType: "user", resourceId: other.userId, start: "2026-11-06" })).rejects.toMatchObject({
      status: 404,
    });

    await deleteAssignment(ctx, a1.id);
    await deleteVehicle(ctx, van);
    week = await planning(ctx, "2026-11-02", "2026-11-08");
    expect(week.map((s) => s.title)).toEqual(["Terrasse Durand"]);
  });
});
