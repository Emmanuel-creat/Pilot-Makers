import { beforeAll, describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { acceptInvite, inviteMember } from "@/lib/services/team";
import { classifyDays, formatMinutes, parseDuration } from "@/lib/services/timesheet-calc";
import {
  addEntry,
  deleteEntry,
  jobHours,
  listEntries,
  payroll,
  payrollCsv,
  reviewEntries,
  runningEntry,
  setMemberQualification,
  startTimer,
  stopTimer,
  updateEntry,
} from "@/lib/services/timesheets";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let boss: Ctx;
let worker: Ctx;
let jobId: string;
const NOW = new Date("2026-10-20T12:00:00Z");

beforeAll(async () => {
  db = await freshDb();
  boss = await signUp(db, "patron@exemple.fr");
  await completeProfile(boss);
  await db.query("UPDATE organizations SET pricing=$2 WHERE id=$1", [
    boss.orgId,
    JSON.stringify({ laborRates: [{ label: "Ouvrier", priceCents: 4500, costCents: 3000 }] }),
  ]);
  const { token } = await inviteMember(boss, { email: "ouvrier@exemple.fr", role: "member" });
  const w = await signUp(db, "ouvrier@exemple.fr", "Perso");
  await acceptInvite(w, token);
  worker = { ...w, orgId: boss.orgId, role: "member" };
  const qid = await createQuote(boss, { customerId: await makeCustomer(boss) });
  const d = await getDraft(boss, qid);
  await saveDraft(boss, qid, { ...d, title: "Carrelage cuisine", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  await issueQuote(boss, qid);
  await recordResponseManually(boss, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  jobId = await createJobFromQuote(boss, qid);
});

describe("calculs", () => {
  it("lit les durées saisies et les affiche", () => {
    expect(parseDuration("7:30")).toBe(450);
    expect(parseDuration("7h30")).toBe(450);
    expect(parseDuration("7 h")).toBe(420);
    expect(parseDuration("7,5")).toBe(450);
    expect(parseDuration("45 min")).toBe(45);
    expect(parseDuration("7:75")).toBeNull();
    expect(parseDuration("beaucoup")).toBeNull();
    expect(formatMinutes(450)).toBe("7 h 30");
    expect(formatMinutes(480)).toBe("8 h");
  });

  it("heures supplémentaires par semaine civile, dans l'ordre des jours", () => {
    // Semaine du lundi 5 octobre 2026 : 5 jours de 9 h = 45 h, soit 35 h + 8 h à 25 % + 2 h à 50 %.
    const days = Object.fromEntries(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"].map((d) => [d, 540]));
    const c = classifyDays(days);
    expect(c["2026-10-05"]).toEqual({ normal: 540, hs25: 0, hs50: 0 });
    expect(c["2026-10-08"]).toEqual({ normal: 480, hs25: 60, hs50: 0 });
    expect(c["2026-10-09"]).toEqual({ normal: 0, hs25: 420, hs50: 120 });
    // La semaine suivante repart de zéro.
    expect(classifyDays({ ...days, "2026-10-12": 540 })["2026-10-12"]).toEqual({ normal: 540, hs25: 0, hs50: 0 });
  });
});

describe("pointage", () => {
  it("chronomètre sur le chantier : un seul à la fois, durée calculée", async () => {
    const start = new Date("2026-10-13T06:00:00Z");
    await startTimer(worker, { jobId, latitude: "45.76", longitude: "4.83" }, start);
    await expect(startTimer(worker, { jobId }, start)).rejects.toMatchObject({ status: 409 });
    expect((await runningEntry(worker))?.job_title).toBe("Carrelage cuisine");
    const r = await stopTimer(worker, { note: "Pose faïence" }, new Date("2026-10-13T14:30:00Z"));
    expect(r.minutes).toBe(510);
    expect(await runningEntry(worker)).toBeNull();
    await expect(stopTimer(worker)).rejects.toMatchObject({ status: 404 });
  });

  it("saisie, droits du membre, validation et verrouillage", async () => {
    await expect(addEntry(worker, { date: "2026-10-12", duration: "abc" }, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(addEntry(worker, { date: "2099-01-01", duration: "7" }, NOW)).rejects.toMatchObject({ status: 400 });
    const id = await addEntry(worker, { jobId, date: "2026-10-12", duration: "8", note: "Ragréage" }, NOW);
    await expect(addEntry(worker, { date: "2026-10-12", duration: "8", userId: boss.userId }, NOW)).rejects.toMatchObject({ status: 403 });
    await addEntry(boss, { jobId, date: "2026-10-12", duration: "4", userId: worker.userId }, NOW);

    const mine = await listEntries(worker, { from: "2026-10-01", to: "2026-10-31" });
    expect(mine).toHaveLength(3);
    expect(mine.every((e) => e.user_id === worker.userId)).toBe(true);
    // Un membre ne voit pas les heures des autres, même en filtrant.
    await addEntry(boss, { date: "2026-10-12", duration: "2" }, NOW);
    expect(await listEntries(worker, { from: "2026-10-01", to: "2026-10-31", userId: boss.userId })).toHaveLength(3);
    await expect(
      deleteEntry(worker, (await listEntries(boss, { from: "2026-10-12", to: "2026-10-12", userId: boss.userId }))[0].id),
    ).rejects.toMatchObject({
      status: 404,
    });

    await expect(reviewEntries(worker, [id], "valide")).rejects.toMatchObject({ status: 403 });
    await expect(reviewEntries(boss, [id], "refuse")).rejects.toMatchObject({ status: 400 });
    await reviewEntries(boss, [id], "refuse", "Chantier erroné");
    await updateEntry(worker, id, { jobId, date: "2026-10-12", duration: "7:30", note: "Ragréage" }, NOW);
    expect((await listEntries(worker, { from: "2026-10-12", to: "2026-10-12" })).find((e) => e.id === id)?.status).toBe("saisi");
    await reviewEntries(boss, [id], "valide");
    await expect(updateEntry(worker, id, { date: "2026-10-12", duration: "9" }, NOW)).rejects.toMatchObject({ status: 403 });
    await expect(deleteEntry(worker, id)).rejects.toMatchObject({ status: 403 });
  });

  it("heures et coût par chantier selon la qualification", async () => {
    await expect(setMemberQualification(boss, worker.userId, "Astronaute")).rejects.toMatchObject({ status: 400 });
    await setMemberQualification(boss, worker.userId, "Ouvrier");
    const h = await jobHours(boss, jobId);
    // 8 h 30 (chronomètre) + 7 h 30 + 4 h = 20 h à 30 euros.
    expect(h.minutes).toBe(1200);
    expect(h.validatedMinutes).toBe(450);
    expect(h.costCents).toBe(60000);
  });

  it("export de paie : heures validées seulement, heures supplémentaires", async () => {
    const all = await listEntries(boss, { from: "2026-10-01", to: "2026-10-31", userId: worker.userId });
    await reviewEntries(
      boss,
      all.map((e) => e.id),
      "valide",
    );
    for (const d of ["2026-10-14", "2026-10-15", "2026-10-16"]) await addEntry(worker, { jobId, date: d, duration: "9" }, NOW);
    await reviewEntries(
      boss,
      (await listEntries(boss, { from: "2026-10-14", to: "2026-10-16", userId: worker.userId })).map((e) => e.id),
      "valide",
    );
    await addEntry(worker, { date: "2026-10-17", duration: "3" }, NOW);
    const rows = await payroll(boss, "2026-10");
    const w = rows.find((r) => r.userId === worker.userId)!;
    // Semaine du 12 : 11 h 30 (lundi) + 8 h 30 (mardi) + 27 h = 47 h, soit 35 h, 8 h à 25 % et 4 h à 50 %.
    expect(w).toMatchObject({ days: 5, minutes: 2820, normal: 2100, hs25: 480, hs50: 240, pending: 180, qualification: "Ouvrier" });
    await expect(payroll(worker, "2026-10")).rejects.toMatchObject({ status: 403 });
    const csv = parseCsv(await payrollCsv(boss, "2026-10"));
    expect(csv[0]).toContain("heures_sup_25");
    expect(csv.find((r) => r[2] === "Ouvrier")?.slice(4, 9)).toEqual(["47,00", "35,00", "8,00", "4,00", "3,00"]);
  });
});
