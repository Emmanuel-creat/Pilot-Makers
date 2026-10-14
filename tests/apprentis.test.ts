import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { contractStatus, isSchoolDay, nextSkills, parseSchoolDays, progress, schoolDaysLabel } from "@/lib/apprentice";
import { addSkill, createApprentice, deleteApprentice, getApprentice, listApprentices, setSkillLevel, updateApprentice } from "@/lib/services/apprentices";
import type { Ctx } from "@/lib/services/context";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("règles du parcours", () => {
  it("mesure la progression et propose les prochaines étapes", () => {
    expect(progress(["a_voir", "montre", "accompagne", "autonome"])).toEqual({ total: 4, autonomous: 1, started: 3, percent: 50 });
    expect(progress([]).percent).toBe(0);
    const next = nextSkills([
      { level: "a_voir" as const, position: 0 },
      { level: "accompagne" as const, position: 3 },
      { level: "autonome" as const, position: 1 },
      { level: "montre" as const, position: 2 },
    ]);
    expect(next.map((s) => s.position)).toEqual([3, 2, 0]);
  });

  it("gère les jours d'école et la fin du contrat", () => {
    expect(parseSchoolDays(["3", "1", "1", "7", "x"])).toEqual([1, 3]);
    expect(schoolDaysLabel([1, 3])).toBe("lundi, mercredi");
    expect(isSchoolDay("2026-10-14", [3])).toBe(true);
    expect(contractStatus("2026-11-30", "2026-10-14")).toEqual({ daysLeft: 47, tone: "soon" });
    expect(contractStatus("2026-10-01", "2026-10-14").tone).toBe("ended");
    expect(contractStatus(null, "2026-10-14").daysLeft).toBeNull();
  });
});

describe("parcours d'un apprenti", () => {
  let db: Database;
  let ctx: Ctx;
  let apprenti: string;
  let tuteur: string;
  let id: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "apprentis@exemple.fr");
    await completeProfile(ctx);
    apprenti = (await signUp(db, "apprenti@exemple.fr", "Apprenti")).userId;
    tuteur = (await signUp(db, "tuteur@exemple.fr", "Tuteur")).userId;
    for (const u of [apprenti, tuteur])
      await db.query("INSERT INTO memberships (org_id, user_id, role, job_function) VALUES ($1,$2,'member','ouvrier')", [ctx.orgId, u]);
  });

  it("crée la fiche avec le parcours par défaut", async () => {
    await expect(createApprentice(ctx, apprenti, { tutorId: apprenti })).rejects.toMatchObject({ status: 400 });
    await expect(createApprentice(ctx, apprenti, { contractStart: "2026-09-01", contractEnd: "2026-08-01" })).rejects.toMatchObject({ status: 400 });
    id = await createApprentice(ctx, apprenti, {
      tutorId: tuteur,
      diploma: "CAP Carreleur mosaïste",
      school: "CFA du bâtiment",
      contractStart: "2026-09-01",
      contractEnd: "2028-08-31",
      schoolDays: ["1", "2"],
    });
    await expect(createApprentice(ctx, apprenti, {})).rejects.toMatchObject({ status: 400 });
    const d = await getApprentice(ctx, id);
    expect(d.apprentice.tutorId).toBe(tuteur);
    expect(d.apprentice.schoolDays).toEqual([1, 2]);
    expect(d.apprentice.contractEnd).toBe("2028-08-31");
    expect(d.skills.length).toBe(15);
    expect(d.skills[0].category).toBe("Sécurité");
  });

  it("laisse le tuteur valider et l'apprenti consulter", async () => {
    const asTutor: Ctx = { ...ctx, userId: tuteur, role: "member", jobFunction: "ouvrier" };
    const asApprentice: Ctx = { ...ctx, userId: apprenti, role: "member", jobFunction: "ouvrier" };
    const d = await getApprentice(asTutor, id);
    expect(d.canValidate).toBe(true);
    await setSkillLevel(asTutor, d.skills[0].id, "autonome", "Casque et chaussures portés sans rappel");
    await expect(setSkillLevel(asTutor, d.skills[1].id, "expert", "")).rejects.toMatchObject({ status: 400 });
    await addSkill(asTutor, id, "Gestes du métier", "Poser une faïence murale");
    const mine = await getApprentice(asApprentice, id);
    expect(mine.canValidate).toBe(false);
    expect(mine.skills[0]).toMatchObject({ level: "autonome", updatedByName: "Paul Martin" });
    expect(mine.skills.at(-1)?.label).toBe("Poser une faïence murale");
    await expect(setSkillLevel(asApprentice, mine.skills[1].id, "autonome", "")).rejects.toMatchObject({ status: 403 });
    expect((await listApprentices(asTutor)).map((a) => a.levels.length)).toEqual([16]);
    await expect(updateApprentice(asTutor, id, {})).rejects.toMatchObject({ status: 403 });
  });

  it("supprime le parcours avec ses compétences", async () => {
    await deleteApprentice(ctx, id);
    expect(await listApprentices(ctx)).toEqual([]);
    expect((await db.query("SELECT count(*)::int AS n FROM apprentice_skills"))[0]).toEqual({ n: 0 });
  });
});
