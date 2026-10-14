/**
 * Parcours de formation des apprentis : fiche de l'apprenti (tuteur, diplôme préparé, école, jours d'école),
 * compétences du parcours et validation de chaque étape par le tuteur.
 */

import { z } from "zod";
import { one } from "@/lib/db";
import { DEFAULT_PATH, SKILL_LEVELS, isSkillLevel, parseSchoolDays, type SkillLevel } from "@/lib/apprentice";
import { badRequest, forbidden, isUuid, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, can, requirePermission, requireWritable } from "./context";

export interface Apprentice {
  id: string;
  userId: string;
  name: string;
  tutorId: string | null;
  tutorName: string | null;
  diploma: string;
  school: string;
  contractStart: string | null;
  contractEnd: string | null;
  schoolDays: number[];
  levels: SkillLevel[];
}

export interface ApprenticeSkill {
  id: string;
  category: string;
  label: string;
  position: number;
  level: SkillLevel;
  note: string;
  updatedAt: Date | null;
  updatedByName: string | null;
}

type Row = {
  id: string;
  user_id: string;
  name: string;
  tutor_id: string | null;
  tutor_name: string | null;
  diploma: string;
  school: string;
  contract_start: string | null;
  contract_end: string | null;
  school_days: number[] | null;
  levels: SkillLevel[] | null;
};

const SELECT = `SELECT a.id, a.user_id, u.name, a.tutor_id, t.name AS tutor_name, a.diploma, a.school,
  to_char(a.contract_start, 'YYYY-MM-DD') AS contract_start, to_char(a.contract_end, 'YYYY-MM-DD') AS contract_end, a.school_days,
  (SELECT array_agg(s.level ORDER BY s.position) FROM apprentice_skills s WHERE s.apprentice_id=a.id) AS levels
  FROM apprentices a JOIN users u ON u.id=a.user_id LEFT JOIN users t ON t.id=a.tutor_id`;

function toApprentice(r: Row): Apprentice {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    tutorId: r.tutor_id,
    tutorName: r.tutor_name,
    diploma: r.diploma,
    school: r.school,
    contractStart: r.contract_start,
    contractEnd: r.contract_end,
    schoolDays: (r.school_days ?? []).map(Number),
    levels: r.levels ?? [],
  };
}

/** La direction voit tous les apprentis ; un tuteur voit ceux qu'il suit, un apprenti son propre parcours. */
export async function listApprentices(ctx: Ctx): Promise<Apprentice[]> {
  const all = can(ctx, "staff");
  const rows = await ctx.db.query<Row>(
    `${SELECT} WHERE a.org_id=$1 ${all ? "" : "AND (a.tutor_id=$2 OR a.user_id=$2)"} ORDER BY u.name`,
    all ? [ctx.orgId] : [ctx.orgId, ctx.userId],
  );
  return rows.map(toApprentice);
}

async function load(ctx: Ctx, id: string) {
  if (!isUuid(id)) throw notFound("Apprenti introuvable");
  const r = await one<Row>(ctx.db, `${SELECT} WHERE a.id=$1 AND a.org_id=$2`, [id, ctx.orgId]);
  if (!r) throw notFound("Apprenti introuvable");
  const a = toApprentice(r);
  const isTutor = a.tutorId === ctx.userId;
  if (!can(ctx, "staff") && !isTutor && a.userId !== ctx.userId) throw notFound("Apprenti introuvable");
  return { a, canValidate: can(ctx, "staff") || isTutor };
}

export async function getApprentice(ctx: Ctx, id: string) {
  const { a, canValidate } = await load(ctx, id);
  const skills = await ctx.db.query<{
    id: string;
    category: string;
    label: string;
    position: number;
    level: SkillLevel;
    note: string;
    updated_at: Date | null;
    updated_by_name: string | null;
  }>(
    `SELECT s.id, s.category, s.label, s.position, s.level, s.note, s.updated_at, u.name AS updated_by_name
     FROM apprentice_skills s LEFT JOIN users u ON u.id=s.updated_by WHERE s.apprentice_id=$1 ORDER BY s.position`,
    [a.id],
  );
  return {
    apprentice: a,
    canValidate,
    canEdit: can(ctx, "staff"),
    skills: skills.map(
      (s): ApprenticeSkill => ({
        id: s.id,
        category: s.category,
        label: s.label,
        position: Number(s.position),
        level: s.level,
        note: s.note,
        updatedAt: s.updated_at,
        updatedByName: s.updated_by_name,
      }),
    ),
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const optDate = z
  .string()
  .trim()
  .default("")
  .refine((v) => !v || DATE.test(v), "Date invalide");
const schema = z.object({
  tutorId: z.string().trim().default(""),
  diploma: z.string().trim().max(120, "Diplôme trop long").default(""),
  school: z.string().trim().max(120, "Nom de l'école trop long").default(""),
  contractStart: optDate,
  contractEnd: optDate,
  schoolDays: z.array(z.unknown()).default([]),
});

async function checkMember(ctx: Ctx, userId: string, what: string) {
  if (!isUuid(userId)) throw badRequest(`Choisissez ${what}`);
  const m = await one(ctx.db, "SELECT 1 FROM memberships WHERE org_id=$1 AND user_id=$2", [ctx.orgId, userId]);
  if (!m) throw badRequest(`Choisissez ${what} parmi l'équipe`);
}

function parse(raw: unknown) {
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const d = p.data;
  if (d.contractStart && d.contractEnd && d.contractEnd < d.contractStart) throw badRequest("La fin du contrat précède son début");
  return { ...d, schoolDays: parseSchoolDays(d.schoolDays) };
}

export async function createApprentice(ctx: Ctx, userId: string, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "staff");
  await checkMember(ctx, userId, "l'apprenti");
  const d = parse(raw);
  if (d.tutorId) await checkMember(ctx, d.tutorId, "le tuteur");
  if (d.tutorId === userId) throw badRequest("L'apprenti ne peut pas être son propre tuteur");
  const exists = await one(ctx.db, "SELECT 1 FROM apprentices WHERE org_id=$1 AND user_id=$2", [ctx.orgId, userId]);
  if (exists) throw badRequest("Cette personne suit déjà un parcours d'apprentissage");
  const id = await ctx.db.transaction(async (tx) => {
    const r = await one<{ id: string }>(
      tx,
      `INSERT INTO apprentices (org_id, user_id, tutor_id, diploma, school, contract_start, contract_end, school_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [ctx.orgId, userId, d.tutorId || null, d.diploma, d.school, d.contractStart || null, d.contractEnd || null, d.schoolDays],
    );
    let position = 0;
    for (const group of DEFAULT_PATH)
      for (const label of group.labels)
        await tx.query("INSERT INTO apprentice_skills (org_id, apprentice_id, category, label, position) VALUES ($1,$2,$3,$4,$5)", [
          ctx.orgId,
          r!.id,
          group.category,
          label,
          position++,
        ]);
    return r!.id;
  });
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "apprentice.create", target: id, ip: ctx.ip });
  return id;
}

export async function updateApprentice(ctx: Ctx, id: string, raw: unknown) {
  requireWritable(ctx);
  requirePermission(ctx, "staff");
  const { a } = await load(ctx, id);
  const d = parse(raw);
  if (d.tutorId) await checkMember(ctx, d.tutorId, "le tuteur");
  if (d.tutorId === a.userId) throw badRequest("L'apprenti ne peut pas être son propre tuteur");
  await ctx.db.query("UPDATE apprentices SET tutor_id=$2, diploma=$3, school=$4, contract_start=$5, contract_end=$6, school_days=$7 WHERE id=$1", [
    a.id,
    d.tutorId || null,
    d.diploma,
    d.school,
    d.contractStart || null,
    d.contractEnd || null,
    d.schoolDays,
  ]);
}

export async function deleteApprentice(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requirePermission(ctx, "staff");
  const { a } = await load(ctx, id);
  await ctx.db.query("DELETE FROM apprentices WHERE id=$1", [a.id]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "apprentice.delete", target: a.id, ip: ctx.ip });
}

async function loadSkill(ctx: Ctx, skillId: string) {
  if (!isUuid(skillId)) throw notFound("Compétence introuvable");
  const s = await one<{ apprentice_id: string }>(ctx.db, "SELECT apprentice_id FROM apprentice_skills WHERE id=$1 AND org_id=$2", [skillId, ctx.orgId]);
  if (!s) throw notFound("Compétence introuvable");
  const { a, canValidate } = await load(ctx, s.apprentice_id);
  if (!canValidate) throw forbidden("Seul le tuteur ou la direction valide les étapes du parcours");
  return a;
}

/** Le tuteur fait progresser une compétence ; l'auteur et la date de la validation sont conservés. */
export async function setSkillLevel(ctx: Ctx, skillId: string, level: string, note: string) {
  requireWritable(ctx);
  if (!isSkillLevel(level)) throw badRequest(`Niveau attendu : ${SKILL_LEVELS.join(", ")}`);
  await loadSkill(ctx, skillId);
  await ctx.db.query("UPDATE apprentice_skills SET level=$2, note=$3, updated_at=now(), updated_by=$4 WHERE id=$1", [
    skillId,
    level,
    note.trim().slice(0, 300),
    ctx.userId,
  ]);
}

export async function addSkill(ctx: Ctx, apprenticeId: string, category: string, label: string) {
  requireWritable(ctx);
  const { a, canValidate } = await load(ctx, apprenticeId);
  if (!canValidate) throw forbidden("Seul le tuteur ou la direction adapte le parcours");
  const l = label.trim();
  const c = category.trim() || "Gestes du métier";
  if (!l) throw badRequest("Indiquez la compétence à acquérir");
  if (l.length > 160 || c.length > 80) throw badRequest("Intitulé trop long");
  const max = await one<{ p: number | null }>(ctx.db, "SELECT max(position) AS p FROM apprentice_skills WHERE apprentice_id=$1", [a.id]);
  await ctx.db.query("INSERT INTO apprentice_skills (org_id, apprentice_id, category, label, position) VALUES ($1,$2,$3,$4,$5)", [
    ctx.orgId,
    a.id,
    c,
    l,
    Number(max?.p ?? -1) + 1,
  ]);
}

export async function deleteSkill(ctx: Ctx, skillId: string) {
  requireWritable(ctx);
  await loadSkill(ctx, skillId);
  await ctx.db.query("DELETE FROM apprentice_skills WHERE id=$1", [skillId]);
}
