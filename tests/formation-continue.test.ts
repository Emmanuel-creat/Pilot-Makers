import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { MODULES, grade, moduleById } from "@/lib/training";
import type { Ctx } from "@/lib/services/context";
import { myTraining, submitQuiz, teamTraining } from "@/lib/services/training";
import { freshDb, signUp } from "./helpers";

describe("modules de formation", () => {
  it("chaque module a des identifiants uniques, trois questions et des réponses valides", () => {
    expect(new Set(MODULES.map((m) => m.id)).size).toBe(MODULES.length);
    for (const m of MODULES) {
      expect(m.points.length).toBeGreaterThanOrEqual(3);
      expect(m.source).not.toBe("");
      for (const q of m.quiz) {
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(q.choices.length);
        expect(q.why).not.toBe("");
      }
    }
  });

  it("validé à partir de deux bonnes réponses sur trois", () => {
    const m = moduleById("amiante-avant-travaux")!;
    expect(grade(m, [0, 1, 1])).toMatchObject({ score: 3, passed: true });
    expect(grade(m, [0, 0, 1])).toMatchObject({ score: 2, passed: true });
    const r = grade(m, [1, 0, null]);
    expect(r).toMatchObject({ score: 0, passed: false });
    expect(r.corrections.every((c) => !c.ok && c.why)).toBe(true);
  });
});

describe("suivi des résultats", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "formation@exemple.fr");
  });

  it("un module validé le reste, les tentatives sont comptées", async () => {
    expect((await submitQuiz(ctx, "plomb-avant-1949", [1, 0, 0])).passed).toBe(false);
    expect((await submitQuiz(ctx, "plomb-avant-1949", [0, 1, 1])).passed).toBe(true);
    expect((await submitQuiz(ctx, "plomb-avant-1949", [1, 0, 0])).passed).toBe(false);
    expect((await myTraining(ctx)).get("plomb-avant-1949")).toMatchObject({ score: 3, passed: true, attempts: 3 });
    await expect(submitQuiz(ctx, "inconnu", [0, 0, 0])).rejects.toThrow(/introuvable/);
    await expect(submitQuiz(ctx, "plomb-avant-1949", [0])).rejects.toThrow(/trois questions/);
  });

  it("le dirigeant voit les modules validés par chacun", async () => {
    expect(await teamTraining(ctx)).toEqual([expect.objectContaining({ passed: ["plomb-avant-1949"], total: MODULES.length })]);
    await expect(teamTraining({ ...ctx, role: "member" } as Ctx)).rejects.toThrow();
  });
});
