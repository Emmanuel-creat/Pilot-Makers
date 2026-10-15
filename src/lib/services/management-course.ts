/** Parcours de gestion d'entreprise artisanale : progression, examen final et attestation de réussite vérifiable. */

import { randomBytes, randomInt } from "node:crypto";
import type { Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, conflict, isUuid, notFound, tooMany } from "@/lib/http";
import { CODE_PATTERN, COURSE, certificateCode, examQuestions, gradeExam, missingModules } from "@/lib/management-course";
import type { Ctx } from "./context";
import { audit } from "./context";

/** Durée pendant laquelle un sujet commencé reste ouvert */
const EXAM_HOURS = 2;
/** Tentatives d'examen par période de 24 heures */
export const DAILY_ATTEMPTS = 3;

export interface Certificate {
  code: string;
  holderName: string;
  companyName: string;
  score: number;
  total: number;
  issuedAt: string;
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
const toCert = (r: Record<string, unknown>): Certificate => ({
  code: String(r.code),
  holderName: String(r.holder_name),
  companyName: String(r.company_name),
  score: Number(r.score),
  total: Number(r.total),
  issuedAt: iso(r.issued_at),
});

async function passedModules(ctx: Ctx) {
  const rows = await ctx.db.query<{ module_id: string }>("SELECT module_id FROM training_results WHERE user_id=$1 AND org_id=$2 AND passed", [
    ctx.userId,
    ctx.orgId,
  ]);
  return new Set(rows.map((r) => r.module_id));
}

async function myCertificate(ctx: Ctx) {
  const r = await one<Record<string, unknown>>(ctx.db, "SELECT * FROM course_certificates WHERE user_id=$1 AND course_id=$2", [ctx.userId, COURSE.id]);
  return r ? toCert(r) : null;
}

async function openExam(ctx: Ctx) {
  return one<{ id: string; seed: number }>(
    ctx.db,
    `SELECT id, seed FROM course_exams WHERE user_id=$1 AND org_id=$2 AND course_id=$3 AND submitted_at IS NULL
       AND started_at > now() - interval '${EXAM_HOURS} hours' ORDER BY started_at DESC LIMIT 1`,
    [ctx.userId, ctx.orgId, COURSE.id],
  );
}

export async function courseProgress(ctx: Ctx) {
  const passed = await passedModules(ctx);
  const attempts = await ctx.db.query<{ score: unknown; submitted_at: unknown }>(
    "SELECT score, submitted_at FROM course_exams WHERE user_id=$1 AND course_id=$2 AND submitted_at IS NOT NULL ORDER BY submitted_at DESC LIMIT 5",
    [ctx.userId, COURSE.id],
  );
  return {
    passed,
    missing: missingModules(passed),
    certificate: await myCertificate(ctx),
    openExamId: (await openExam(ctx))?.id ?? null,
    attempts: attempts.map((a) => ({ score: num(a.score), at: iso(a.submitted_at) })),
  };
}

/** Ouvre un sujet d'examen, ou reprend celui qui est en cours. Les huit modules doivent être validés. */
export async function startExam(ctx: Ctx): Promise<string> {
  if (missingModules(await passedModules(ctx)).length) throw badRequest("Validez d'abord les huit modules du parcours");
  const current = await openExam(ctx);
  if (current) return current.id;
  const recent = num(
    (
      await one<{ n: unknown }>(
        ctx.db,
        "SELECT count(*) AS n FROM course_exams WHERE user_id=$1 AND course_id=$2 AND started_at > now() - interval '24 hours'",
        [ctx.userId, COURSE.id],
      )
    )?.n,
  );
  if (recent >= DAILY_ATTEMPTS) throw tooMany(`${DAILY_ATTEMPTS} tentatives par jour au plus : revoyez les modules et réessayez demain`);
  const r = await one<{ id: string }>(ctx.db, "INSERT INTO course_exams (user_id, org_id, course_id, seed) VALUES ($1,$2,$3,$4) RETURNING id", [
    ctx.userId,
    ctx.orgId,
    COURSE.id,
    randomInt(1, 2 ** 31 - 1),
  ]);
  return r!.id;
}

/** Sujet d'un examen en cours, sans les réponses. */
export async function getExam(ctx: Ctx, examId: string) {
  const e = isUuid(examId)
    ? await one<{ seed: number }>(
        ctx.db,
        `SELECT seed FROM course_exams WHERE id=$1 AND user_id=$2 AND submitted_at IS NULL AND started_at > now() - interval '${EXAM_HOURS} hours'`,
        [examId, ctx.userId],
      )
    : null;
  if (!e) return null;
  return examQuestions(e.seed).map((q) => ({ q: q.q, choices: q.choices }));
}

/** Corrige l'examen ; s'il est réussi, délivre l'attestation (une seule par personne et par parcours). */
export async function submitExam(ctx: Ctx, examId: string, answers: (number | null)[]) {
  const e = isUuid(examId)
    ? await one<{ id: string; seed: number }>(
        ctx.db,
        `SELECT id, seed FROM course_exams WHERE id=$1 AND user_id=$2 AND submitted_at IS NULL AND started_at > now() - interval '${EXAM_HOURS} hours'`,
        [examId, ctx.userId],
      )
    : null;
  if (!e) throw notFound("Examen introuvable, déjà corrigé ou expiré : ouvrez un nouveau sujet");
  if (answers.length !== COURSE.examSize) throw badRequest(`Répondez aux ${COURSE.examSize} questions`);
  const result = gradeExam(e.seed, answers);
  const done = await ctx.db.query("UPDATE course_exams SET score=$2, submitted_at=now() WHERE id=$1 AND submitted_at IS NULL RETURNING id", [
    e.id,
    result.score,
  ]);
  if (!done.length) throw conflict("Cet examen a déjà été corrigé");
  let certificate = await myCertificate(ctx);
  if (result.passed && !certificate) {
    const who = await one<{ holder: string; company: string }>(
      ctx.db,
      `SELECT coalesce(nullif(u.name, ''), u.email) AS holder, coalesce(nullif(o.trade_name, ''), nullif(o.legal_name, ''), '') AS company
       FROM users u, organizations o WHERE u.id=$1 AND o.id=$2`,
      [ctx.userId, ctx.orgId],
    );
    const r = await one<Record<string, unknown>>(
      ctx.db,
      `INSERT INTO course_certificates (code, user_id, org_id, course_id, holder_name, company_name, score, total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [certificateCode(randomBytes(8)), ctx.userId, ctx.orgId, COURSE.id, who?.holder ?? "", who?.company ?? "", result.score, result.total],
    );
    certificate = toCert(r!);
    await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "course.certified", target: certificate.code });
  }
  return { ...result, certificate: result.passed ? certificate : null };
}

/** Vérification publique d'une attestation par son numéro. */
export async function verifyCertificate(db: Queryable, code: string): Promise<Certificate | null> {
  const c = code.trim().toUpperCase();
  if (!CODE_PATTERN.test(c)) return null;
  const r = await one<Record<string, unknown>>(db, "SELECT * FROM course_certificates WHERE code=$1", [c]);
  return r ? toCert(r) : null;
}
