import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { CODE_PATTERN, COURSE, certificateCode, examQuestions, gradeExam, questionPool } from "@/lib/management-course";
import type { Ctx } from "@/lib/services/context";
import { courseProgress, getExam, startExam, submitExam, verifyCertificate } from "@/lib/services/management-course";
import { submitQuiz } from "@/lib/services/training";
import { moduleById } from "@/lib/training";
import { freshDb, signUp } from "./helpers";

describe("sujet et correction", () => {
  it("couvre chaque module, reste stable pour une graine et note sur douze", () => {
    expect(COURSE.modules.every((id) => moduleById(id))).toBe(true);
    expect(questionPool()).toHaveLength(COURSE.modules.length * 3);
    for (const seed of [1, 42, 99999]) {
      const qs = examQuestions(seed);
      expect(qs).toHaveLength(COURSE.examSize);
      expect(new Set(qs.map((q) => q.ref)).size).toBe(COURSE.examSize);
      for (const id of COURSE.modules) expect(qs.some((q) => q.ref.startsWith(`${id}:`))).toBe(true);
      expect(examQuestions(seed)).toEqual(qs);
    }
    const qs = examQuestions(7);
    expect(
      gradeExam(
        7,
        qs.map((q) => q.answer),
      ),
    ).toMatchObject({ score: 12, passed: true });
    const nine = qs.map((q, i) => (i < 9 ? q.answer : null));
    expect(gradeExam(7, nine).passed).toBe(true);
    expect(
      gradeExam(
        7,
        qs.map((q, i) => (i < 8 ? q.answer : null)),
      ).passed,
    ).toBe(false);
    const code = certificateCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    expect(code).toBe("GEA-ABCD-EFGH");
    expect(CODE_PATTERN.test(code)).toBe(true);
  });
});

describe("examen et attestation", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "eleve@gestion.fr", "Carrelage Martin");
  });

  it("exige les huit modules avant l'examen", async () => {
    await expect(startExam(ctx)).rejects.toThrow(/huit modules/);
    for (const id of COURSE.modules)
      await submitQuiz(
        ctx,
        id,
        moduleById(id)!.quiz.map((q) => q.answer),
      );
    expect((await courseProgress(ctx)).missing).toEqual([]);
  });

  it("refuse un examen manqué, puis délivre une attestation vérifiable", async () => {
    const first = await startExam(ctx);
    expect(await startExam(ctx)).toBe(first);
    const subject = await getExam(ctx, first);
    expect(subject).toHaveLength(12);
    expect(JSON.stringify(subject)).not.toMatch(/"answer"|"why"/);
    const failed = await submitExam(ctx, first, Array(12).fill(null));
    expect(failed).toMatchObject({ score: 0, passed: false, certificate: null });
    await expect(submitExam(ctx, first, Array(12).fill(null))).rejects.toMatchObject({ status: 404 });

    const second = await startExam(ctx);
    expect(second).not.toBe(first);
    const { seed } = (await db.query<{ seed: number }>("SELECT seed FROM course_exams WHERE id=$1", [second]))[0];
    const ok = await submitExam(
      ctx,
      second,
      examQuestions(seed).map((q) => q.answer),
    );
    expect(ok.passed).toBe(true);
    expect(ok.certificate).toMatchObject({ holderName: "Paul Martin", companyName: "Carrelage Martin", score: 12, total: 12 });
    const v = await verifyCertificate(db, ok.certificate!.code.toLowerCase());
    expect(v?.code).toBe(ok.certificate!.code);
    expect(await verifyCertificate(db, "GEA-AAAA-AAAA")).toBeNull();
    expect(await verifyCertificate(db, "n'importe quoi")).toBeNull();
    expect((await courseProgress(ctx)).certificate?.code).toBe(ok.certificate!.code);
  });

  it("limite les tentatives à trois par jour", async () => {
    const third = await startExam(ctx);
    await submitExam(ctx, third, Array(12).fill(null));
    await expect(startExam(ctx)).rejects.toMatchObject({ status: 429 });
  });
});
