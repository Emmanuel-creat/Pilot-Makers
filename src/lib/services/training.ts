/** Formation continue : résultats de chacun et suivi de l'équipe. */

import { num } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import { MODULES, grade, moduleById } from "@/lib/training";
import type { Ctx } from "./context";
import { audit, requireRole } from "./context";

export interface TrainingResult {
  moduleId: string;
  score: number;
  passed: boolean;
  attempts: number;
  completedAt: Date;
}

export async function myTraining(ctx: Ctx): Promise<Map<string, TrainingResult>> {
  const rows = await ctx.db.query<{ module_id: string; score: unknown; passed: boolean; attempts: unknown; completed_at: Date }>(
    "SELECT module_id, score, passed, attempts, completed_at FROM training_results WHERE user_id=$1 AND org_id=$2",
    [ctx.userId, ctx.orgId],
  );
  return new Map(
    rows.map((r) => [r.module_id, { moduleId: r.module_id, score: num(r.score), passed: r.passed, attempts: num(r.attempts), completedAt: r.completed_at }]),
  );
}

/** Enregistre un questionnaire. Un module validé le reste : une nouvelle tentative ne fait que l'améliorer. */
export async function submitQuiz(ctx: Ctx, moduleId: string, answers: (number | null)[]) {
  const m = moduleById(moduleId);
  if (!m) throw notFound("Module introuvable");
  if (answers.length !== m.quiz.length) throw badRequest("Répondez aux trois questions");
  const result = grade(m, answers);
  await ctx.db.query(
    `INSERT INTO training_results (user_id, org_id, module_id, score, passed) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (user_id, org_id, module_id) DO UPDATE SET
       score = GREATEST(training_results.score, EXCLUDED.score),
       passed = training_results.passed OR EXCLUDED.passed,
       attempts = training_results.attempts + 1,
       completed_at = CASE WHEN EXCLUDED.score > training_results.score THEN now() ELSE training_results.completed_at END`,
    [ctx.userId, ctx.orgId, moduleId, result.score, result.passed],
  );
  if (result.passed) await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "training.passed", target: moduleId });
  return result;
}

/** Suivi de l'équipe : modules validés par chaque membre (dirigeant et administrateurs). */
export async function teamTraining(ctx: Ctx) {
  requireRole(ctx, "admin");
  const members = await ctx.db.query<{ id: string; name: string; email: string }>(
    "SELECT u.id, u.name, u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.org_id=$1 ORDER BY u.name, u.email",
    [ctx.orgId],
  );
  const rows = await ctx.db.query<{ user_id: string; module_id: string }>("SELECT user_id, module_id FROM training_results WHERE org_id=$1 AND passed", [
    ctx.orgId,
  ]);
  const passed = new Map<string, Set<string>>();
  for (const r of rows) (passed.get(r.user_id) ?? passed.set(r.user_id, new Set()).get(r.user_id)!).add(r.module_id);
  return members.map((m) => {
    const done = passed.get(m.id) ?? new Set<string>();
    return { userId: m.id, name: m.name || m.email, passed: MODULES.filter((x) => done.has(x.id)).map((x) => x.id), total: MODULES.length };
  });
}
