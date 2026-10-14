/**
 * Planification automatique d'un chantier : durée et équipe estimées depuis le devis accepté,
 * puis première période où des personnes compétentes et disponibles peuvent intervenir.
 */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { propose, workingDaysFrom, type Busy, type Candidate } from "@/lib/auto-planning";
import { badRequest, isUuid, notFound } from "@/lib/http";
import type { GeoPoint } from "@/lib/map";
import type { Ctx } from "./context";
import { requireWritable } from "./context";
import { estimateLinesDuration } from "./duration";
import { quoteProducts } from "./product-info";
import { assign } from "./planning";
import { getVersion, parisDate } from "./quotes";

async function loadJob(ctx: Ctx, jobId: string) {
  if (!isUuid(jobId)) throw notFound("Chantier introuvable");
  const j = await one<{ id: string; title: string; quote_id: string | null; latitude: unknown; longitude: unknown; accepted_version: unknown }>(
    ctx.db,
    `SELECT j.id, j.title, j.quote_id, j.latitude, j.longitude, q.accepted_version FROM jobs j LEFT JOIN quotes q ON q.id=j.quote_id
     WHERE j.id=$1 AND j.org_id=$2`,
    [jobId, ctx.orgId],
  );
  if (!j) throw notFound("Chantier introuvable");
  return j;
}

/** Durée et équipe proposées par défaut : estimation de la main-d'oeuvre du devis accepté, sinon une journée à une personne. */
export async function planningDefaults(ctx: Ctx, jobId: string, today = parisDate(new Date())) {
  const j = await loadJob(ctx, jobId);
  let days = 1;
  let crew = 1;
  if (j.quote_id && j.accepted_version != null) {
    const v = await getVersion(ctx.db, ctx.orgId, j.quote_id, num(j.accepted_version));
    const est = await estimateLinesDuration(ctx, { lines: v.snapshot.sections.flatMap((s) => s.lines) });
    if (est.minutes > 0) {
      days = Math.max(1, Math.ceil(est.days));
      crew = est.crew;
    }
  }
  const tomorrow = new Date(`${today}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  // Les produits au délai d'approvisionnement le plus long doivent être livrés avant le démarrage.
  const lead = j.quote_id ? (await quoteProducts(ctx, j.quote_id)).lead : null;
  const from = workingDaysFrom(tomorrow.toISOString().slice(0, 10), 1 + (lead?.days ?? 0)).at(-1)!;
  return { days, crew, skill: "", from, lead };
}

const needSchema = z.object({
  days: z.coerce.number().int("Nombre de jours entier").min(1, "Au moins un jour").max(60, "Soixante jours au plus"),
  crew: z.coerce.number().int().min(1, "Au moins une personne").max(10, "Dix personnes au plus"),
  skill: z.string().trim().max(80).default(""),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de début au plus tôt invalide"),
});

export async function proposeForJob(ctx: Ctx, jobId: string, raw: unknown) {
  const j = await loadJob(ctx, jobId);
  const p = needSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const need = p.data;
  const members = await ctx.db.query<{ user_id: string; name: string; qualification: string }>(
    `SELECT m.user_id, coalesce(nullif(u.name, ''), u.email) AS name, m.qualification FROM memberships m JOIN users u ON u.id=m.user_id
     WHERE m.org_id=$1 AND coalesce(m.job_function, 'gerant') NOT IN ('comptable', 'secretariat')`,
    [ctx.orgId],
  );
  const [certs, assignments, absences, depot] = await Promise.all([
    ctx.db.query<{ user_id: string; name: string }>(
      "SELECT user_id, name FROM member_certifications WHERE org_id=$1 AND (valid_until IS NULL OR valid_until >= $2)",
      [ctx.orgId, need.from],
    ),
    ctx.db.query<{ resource_id: string; start: string; end: string; latitude: unknown; longitude: unknown }>(
      `SELECT a.resource_id, to_char(a.start_date, 'YYYY-MM-DD') AS start, to_char(a.end_date, 'YYYY-MM-DD') AS end, j.latitude, j.longitude
       FROM job_assignments a JOIN jobs j ON j.id=a.job_id
       WHERE a.org_id=$1 AND a.resource_type='user' AND a.job_id <> $2 AND a.end_date >= ($3::date - 30) ORDER BY a.end_date`,
      [ctx.orgId, j.id, need.from],
    ),
    ctx.db.query<{ user_id: string; start: string; end: string }>(
      "SELECT user_id, to_char(start_date, 'YYYY-MM-DD') AS start, to_char(end_date, 'YYYY-MM-DD') AS end FROM member_absences WHERE org_id=$1 AND end_date >= $2",
      [ctx.orgId, need.from],
    ),
    one<{ latitude: unknown; longitude: unknown }>(ctx.db, "SELECT latitude, longitude FROM organizations WHERE id=$1", [ctx.orgId]),
  ]);
  const point = (lat: unknown, lng: unknown): GeoPoint | null => (lat == null || lng == null ? null : { lat: Number(lat), lng: Number(lng) });
  const depotPoint = point(depot?.latitude, depot?.longitude);
  const candidates: Candidate[] = members.map((m) => {
    const mine = assignments.filter((a) => a.resource_id === m.user_id);
    const busy: Busy[] = [...mine.map((a) => ({ start: a.start, end: a.end })), ...absences.filter((a) => a.user_id === m.user_id)];
    const before = mine.filter((a) => a.end < need.from && point(a.latitude, a.longitude)).at(-1);
    return {
      id: m.user_id,
      name: m.name,
      skills: [m.qualification, ...certs.filter((c) => c.user_id === m.user_id).map((c) => c.name)].filter(Boolean).map((s) => s.toLowerCase()),
      busy,
      from: before ? point(before.latitude, before.longitude) : depotPoint,
    };
  });
  const proposal = propose(candidates, need, point(j.latitude, j.longitude));
  return { need, proposal, team: candidates.length, located: !!point(j.latitude, j.longitude) };
}

/** Enregistre la proposition retenue : une affectation par personne sur la période. */
export async function applyProposal(ctx: Ctx, jobId: string, start: string, end: string, userIds: string[]) {
  requireWritable(ctx);
  await loadJob(ctx, jobId);
  if (!userIds.length) throw badRequest("Aucune personne à affecter");
  const conflicts: string[] = [];
  for (const id of [...new Set(userIds)]) {
    const r = await assign(ctx, { jobId, resourceType: "user", resourceId: id, start, end });
    conflicts.push(...r.conflicts);
  }
  return { assigned: new Set(userIds).size, conflicts };
}
