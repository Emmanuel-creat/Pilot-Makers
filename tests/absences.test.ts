import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { absenceDuring, addAbsence, deleteAbsence, listAbsences } from "@/lib/services/absences";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { assign, moveAssignment, planning } from "@/lib/services/planning";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let mate: Ctx;

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
  ctx = await signUp(db, "absences@exemple.fr");
  await completeProfile(ctx);
  const m = await signUp(db, "absences-ouvrier@exemple.fr", "Ouvrier");
  await db.query("INSERT INTO memberships (org_id, user_id, role, job_function) VALUES ($1,$2,'member','ouvrier')", [ctx.orgId, m.userId]);
  mate = { ...m, orgId: ctx.orgId, role: "member", jobFunction: "ouvrier" } as Ctx;
});

describe("congés et absences", () => {
  it("saisie, droits et contrôles", async () => {
    const own = await addAbsence(mate, { userId: mate.userId, kind: "conges", start: "2026-12-21", end: "2026-12-31", note: "Fêtes" });
    await expect(addAbsence(mate, { userId: ctx.userId, kind: "conges", start: "2026-12-21", end: "2026-12-22" })).rejects.toMatchObject({ status: 400 });
    await expect(addAbsence(ctx, { userId: mate.userId, kind: "vacances", start: "2026-12-21", end: "2026-12-22" })).rejects.toMatchObject({ status: 400 });
    await expect(addAbsence(ctx, { userId: mate.userId, kind: "rtt", start: "2026-12-22", end: "2026-12-21" })).rejects.toMatchObject({ status: 400 });
    await expect(addAbsence(ctx, { userId: mate.userId, kind: "rtt", start: "2026-01-01", end: "2027-06-01" })).rejects.toMatchObject({ status: 400 });
    const stranger = await signUp(db, "absences-autre@exemple.fr", "Autre");
    await expect(addAbsence(ctx, { userId: stranger.userId, kind: "rtt", start: "2026-12-22", end: "2026-12-22" })).rejects.toMatchObject({ status: 404 });
    const sick = await addAbsence(ctx, { userId: mate.userId, kind: "maladie", start: "2027-01-04", end: "2027-01-05" });

    const list = await listAbsences(ctx, "2026-12-01", "2027-01-31");
    expect(list.map((a) => [a.kind, a.start, a.end, a.note])).toEqual([
      ["conges", "2026-12-21", "2026-12-31", "Fêtes"],
      ["maladie", "2027-01-04", "2027-01-05", ""],
    ]);
    expect(absenceDuring(list, mate.userId, "2026-12-30", "2027-01-02")?.id).toBe(own);
    expect(absenceDuring(list, mate.userId, "2027-01-01", "2027-01-03")).toBeNull();
    await expect(listAbsences(ctx, "hier", "demain")).rejects.toMatchObject({ status: 400 });

    // Sans droit de gestion de l'équipe, on ne retire que ses propres absences.
    await expect(deleteAbsence({ ...mate, userId: ctx.userId } as Ctx, own)).rejects.toMatchObject({ status: 400 });
    await deleteAbsence(ctx, sick);
    await expect(deleteAbsence(ctx, sick)).rejects.toMatchObject({ status: 404 });
    expect(await listAbsences(ctx, "2027-01-01", "2027-01-31")).toEqual([]);
  });

  it("une affectation pendant une absence est un conflit du planning", async () => {
    const j = await job("Salle de bain Petit");
    await addAbsence(ctx, { userId: mate.userId, kind: "formation", start: "2027-02-10", end: "2027-02-11" });
    const a = await assign(ctx, { jobId: j, resourceType: "user", resourceId: mate.userId, start: "2027-02-08", end: "2027-02-10" });
    expect(a.conflicts).toEqual(["absence (formation)"]);
    const slots = await planning(ctx, "2027-02-08", "2027-02-14");
    expect(slots.find((s) => s.id === a.id)).toMatchObject({ conflict: true, absence: "Formation" });
    const moved = await moveAssignment(ctx, a.id, { resourceType: "user", resourceId: mate.userId, start: "2027-02-15" });
    expect(moved.conflicts).toEqual([]);
    const after = await planning(ctx, "2027-02-15", "2027-02-21");
    expect(after.find((s) => s.id === a.id)).toMatchObject({ conflict: false, absence: null });
  });
});
