import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { absenceDays, acquiredDays, contributionCents, easter, previousPeriod, publicHolidays, workingDays } from "@/lib/leave-fund";
import { addAbsence } from "@/lib/services/absences";
import type { Ctx } from "@/lib/services/context";
import { declarationCsv, getDeclaration, markDeclarationSent, saveDeclaration, saveLeaveFundSettings } from "@/lib/services/leave-fund";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("calendrier et droits", () => {
  it("compte les jours ouvrés hors fériés", () => {
    expect(easter(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(publicHolidays(2026).has("2026-05-14")).toBe(true); // Ascension
    expect(publicHolidays(2026).has("2026-05-25")).toBe(true); // Lundi de Pentecôte
    // Mai 2026 : 21 jours de semaine, dont 4 fériés (1er, 8, 14 et 25 mai).
    expect(workingDays("2026-05")).toHaveLength(17);
    expect(
      absenceDays("2026-05", [
        { start: "2026-04-28", end: "2026-05-06" },
        { start: "2026-05-05", end: "2026-05-07" },
      ]),
    ).toBe(4);
    expect(acquiredDays(151.67 * 60)).toBe(2.5);
    expect(acquiredDays(76 * 60)).toBe(1.3);
    expect(contributionCents(250000, 2000)).toBe(50000);
    expect(previousPeriod("2026-01")).toBe("2025-12");
  });
});

describe("déclaration à la caisse", () => {
  let db: Database;
  let ctx: Ctx;
  let ouvrier: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "conges@exemple.fr");
    await completeProfile(ctx);
    const m = await signUp(db, "conges-ouvrier@exemple.fr", "Ouvrier");
    ouvrier = m.userId;
    await db.query("INSERT INTO memberships (org_id, user_id, role, job_function, qualification) VALUES ($1,$2,'member','ouvrier','Compagnon')", [
      ctx.orgId,
      ouvrier,
    ]);
    for (const day of ["2026-09-01", "2026-09-02", "2026-09-03"])
      await db.query("INSERT INTO time_entries (org_id, user_id, work_date, minutes, status) VALUES ($1,$2,$3,420,'valide')", [ctx.orgId, ouvrier, day]);
    await db.query("INSERT INTO time_entries (org_id, user_id, work_date, minutes, status) VALUES ($1,$2,'2026-09-04',420,'refuse')", [ctx.orgId, ouvrier]);
    await addAbsence(ctx, { userId: ouvrier, kind: "conges", start: "2026-09-14", end: "2026-09-18" });
    await addAbsence(ctx, { userId: ouvrier, kind: "maladie", start: "2026-09-28", end: "2026-10-02" });
  });

  it("prépare le mois depuis le pointage et les absences", async () => {
    const d = await getDeclaration(ctx, "2026-09");
    expect(d.saved).toBe(false);
    // Le chef d'entreprise n'est pas déclaré.
    expect(d.lines.map((l) => [l.name, l.qualification, l.minutes, l.workedDays, l.leaveDays, l.sickDays, l.acquiredDays, l.grossCents])).toEqual([
      [d.lines[0].name, "Compagnon", 1260, 3, 5, 3, 0.3, null],
    ]);
    await expect(getDeclaration(ctx, "2026-13")).rejects.toMatchObject({ status: 400 });
  });

  it("enregistre, exporte puis verrouille la déclaration transmise", async () => {
    await expect(saveDeclaration(ctx, "2026-09", { [ouvrier]: "2400" })).rejects.toMatchObject({ status: 400 });
    await saveLeaveFundSettings(ctx, { fundName: "CIBTP Rhône-Alpes", memberNumber: "69-12345", rate: "19,8" });
    await expect(saveDeclaration(ctx, "2026-09", {})).rejects.toMatchObject({ status: 400 });
    expect(await saveDeclaration(ctx, "2026-09", { [ouvrier]: "2 400,50" })).toEqual({ totalGrossCents: 240050, contributionCents: 47530 });
    const csv = await declarationCsv(ctx, "2026-09");
    expect(csv).toContain("Salaire brut");
    expect(csv).toContain("2400,50");
    // Le mois suivant reprend le salaire brut du mois précédent.
    expect((await getDeclaration(ctx, "2026-10")).lines[0].grossCents).toBe(240050);
    await expect(markDeclarationSent(ctx, "2026-10")).rejects.toMatchObject({ status: 409 });
    await markDeclarationSent(ctx, "2026-09");
    expect(await getDeclaration(ctx, "2026-09")).toMatchObject({ status: "transmise", saved: true });
    await expect(saveDeclaration(ctx, "2026-09", { [ouvrier]: "2500" })).rejects.toMatchObject({ status: 409 });
  });
});
