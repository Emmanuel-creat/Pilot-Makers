/** Communauté d'entraide : lecture et écriture des questions et réponses, votes, signalements. */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/http";
import { REPORT_THRESHOLD, answerSchema, authorLabel, isTopic, questionSchema, rankAnswers, reportSchema, type Topic } from "@/lib/community";
import type { Ctx } from "./context";
import { audit } from "./context";
import { notifyUsers } from "./push";

export interface QuestionSummary {
  id: string;
  topic: Topic;
  title: string;
  author: string;
  answers: number;
  resolved: boolean;
  mine: boolean;
  createdAt: Date;
}

const AUTHOR = `o.trade, o.postal_code, o.country`;
const label = (r: Record<string, unknown>) => authorLabel(String(r.trade ?? ""), String(r.postal_code ?? ""), String(r.country ?? "France"));

function parse<T extends z.ZodTypeAny>(schema: T, raw: unknown): z.infer<T> {
  const r = schema.safeParse(raw);
  if (!r.success) throw badRequest(r.error.issues[0].message);
  return r.data;
}

export async function askQuestion(ctx: Ctx, raw: unknown): Promise<string> {
  const q = parse(questionSchema, raw);
  const r = await one<{ id: string }>(ctx.db, "INSERT INTO community_questions (org_id, user_id, topic, title, body) VALUES ($1,$2,$3,$4,$5) RETURNING id", [
    ctx.orgId,
    ctx.userId,
    q.topic,
    q.title,
    q.body,
  ]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "community.question", target: r!.id });
  return r!.id;
}

export async function listQuestions(ctx: Ctx, opts: { topic?: string; q?: string; filter?: "sans_reponse" | "miennes" | "" } = {}): Promise<QuestionSummary[]> {
  const where = ["NOT cq.hidden"];
  const params: unknown[] = [ctx.orgId];
  if (isTopic(opts.topic)) where.push(`cq.topic = $${params.push(opts.topic)}`);
  if (opts.q?.trim()) where.push(`(cq.title ILIKE $${params.push(`%${opts.q.trim()}%`)} OR cq.body ILIKE $${params.length})`);
  if (opts.filter === "miennes") where.push("cq.org_id = $1");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT cq.id, cq.topic, cq.title, cq.created_at, cq.accepted_answer_id, cq.org_id = $1 AS mine, ${AUTHOR},
            (SELECT count(*) FROM community_answers a WHERE a.question_id = cq.id AND NOT a.hidden) AS answers
       FROM community_questions cq JOIN organizations o ON o.id = cq.org_id
      WHERE ${where.join(" AND ")}
      ORDER BY cq.created_at DESC LIMIT 100`,
    params,
  );
  const list = rows.map((r) => ({
    id: String(r.id),
    topic: r.topic as Topic,
    title: String(r.title),
    author: label(r),
    answers: num(r.answers),
    resolved: r.accepted_answer_id !== null,
    mine: Boolean(r.mine),
    createdAt: r.created_at as Date,
  }));
  return opts.filter === "sans_reponse" ? list.filter((q) => q.answers === 0) : list;
}

export async function getQuestion(ctx: Ctx, id: string) {
  const q = await one<Record<string, unknown>>(
    ctx.db,
    `SELECT cq.*, ${AUTHOR} FROM community_questions cq JOIN organizations o ON o.id = cq.org_id WHERE cq.id = $1 AND NOT cq.hidden`,
    [id],
  );
  if (!q) throw notFound("Question introuvable");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT a.id, a.body, a.created_at, a.org_id, ${AUTHOR},
            (SELECT count(*) FROM community_votes v WHERE v.answer_id = a.id) AS votes,
            EXISTS (SELECT 1 FROM community_votes v WHERE v.answer_id = a.id AND v.user_id = $2) AS voted
       FROM community_answers a JOIN organizations o ON o.id = a.org_id
      WHERE a.question_id = $1 AND NOT a.hidden`,
    [id, ctx.userId],
  );
  const accepted = q.accepted_answer_id ? String(q.accepted_answer_id) : null;
  const answers = rankAnswers(
    rows.map((r) => ({
      id: String(r.id),
      body: String(r.body),
      author: label(r),
      votes: num(r.votes),
      voted: Boolean(r.voted),
      mine: r.org_id === ctx.orgId,
      createdAt: r.created_at as Date,
    })),
    accepted,
  );
  return {
    id: String(q.id),
    topic: q.topic as Topic,
    title: String(q.title),
    body: String(q.body),
    author: label(q),
    mine: q.org_id === ctx.orgId,
    acceptedAnswerId: accepted,
    createdAt: q.created_at as Date,
    answers,
  };
}

export async function answerQuestion(ctx: Ctx, questionId: string, raw: unknown): Promise<string> {
  const a = parse(answerSchema, raw);
  const q = await one<{ org_id: string; user_id: string | null; title: string }>(
    ctx.db,
    "SELECT org_id, user_id, title FROM community_questions WHERE id=$1 AND NOT hidden",
    [questionId],
  );
  if (!q) throw notFound("Question introuvable");
  const r = await one<{ id: string }>(ctx.db, "INSERT INTO community_answers (question_id, org_id, user_id, body) VALUES ($1,$2,$3,$4) RETURNING id", [
    questionId,
    ctx.orgId,
    ctx.userId,
    a.body,
  ]);
  if (q.user_id && q.org_id !== ctx.orgId) {
    await notifyUsers(ctx.db, q.org_id, [q.user_id], { title: "Nouvelle réponse à votre question", body: q.title, url: `/app/entraide/${questionId}` });
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "community.answer", target: r!.id });
  return r!.id;
}

/** Vote « utile » : un par personne, jamais sur sa propre réponse ; un second appel retire le vote. */
export async function toggleVote(ctx: Ctx, answerId: string): Promise<boolean> {
  const a = await one<{ org_id: string }>(ctx.db, "SELECT org_id FROM community_answers WHERE id=$1 AND NOT hidden", [answerId]);
  if (!a) throw notFound("Réponse introuvable");
  if (a.org_id === ctx.orgId) throw forbidden("Impossible de voter pour une réponse de votre entreprise");
  const removed = await ctx.db.query("DELETE FROM community_votes WHERE answer_id=$1 AND user_id=$2 RETURNING answer_id", [answerId, ctx.userId]);
  if (removed.length) return false;
  await ctx.db.query("INSERT INTO community_votes (answer_id, user_id) VALUES ($1,$2)", [answerId, ctx.userId]);
  return true;
}

/** L'entreprise qui a posé la question retient la réponse qui l'a aidée (ou change d'avis). */
export async function acceptAnswer(ctx: Ctx, questionId: string, answerId: string | null) {
  const q = await one<{ org_id: string }>(ctx.db, "SELECT org_id FROM community_questions WHERE id=$1", [questionId]);
  if (!q) throw notFound("Question introuvable");
  if (q.org_id !== ctx.orgId) throw forbidden("Seul l'auteur de la question retient une réponse");
  if (answerId) {
    const a = await one(ctx.db, "SELECT 1 FROM community_answers WHERE id=$1 AND question_id=$2 AND NOT hidden", [answerId, questionId]);
    if (!a) throw notFound("Réponse introuvable");
  }
  await ctx.db.query("UPDATE community_questions SET accepted_answer_id=$2 WHERE id=$1", [questionId, answerId]);
}

/**
 * Signalement : un par personne et par message. Au-delà du seuil, le message est masqué
 * en attendant la modération. On ne signale pas les messages de sa propre entreprise.
 */
export async function report(ctx: Ctx, kind: "question" | "reponse", id: string, raw: unknown): Promise<{ hidden: boolean }> {
  const { reason } = parse(reportSchema, raw);
  const table = kind === "question" ? "community_questions" : "community_answers";
  const target = await one<{ org_id: string }>(ctx.db, `SELECT org_id FROM ${table} WHERE id=$1`, [id]);
  if (!target) throw notFound("Message introuvable");
  if (target.org_id === ctx.orgId) throw badRequest("Ce message vient de votre entreprise");
  await ctx.db.query(
    "INSERT INTO community_reports (target_kind, target_id, user_id, reason) VALUES ($1,$2,$3,$4) ON CONFLICT (target_kind, target_id, user_id) DO NOTHING",
    [kind, id, ctx.userId, reason],
  );
  const n = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM community_reports WHERE target_kind=$1 AND target_id=$2", [kind, id]);
  const hidden = num(n?.n) >= REPORT_THRESHOLD;
  if (hidden) await ctx.db.query(`UPDATE ${table} SET hidden=true WHERE id=$1`, [id]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "community.report", target: id, data: { kind, reason } });
  return { hidden };
}
