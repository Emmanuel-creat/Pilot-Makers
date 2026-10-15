/** Note de confiance calculée sur les chantiers réceptionnés dans l'application, affichable sur la vitrine. */

import type { Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { DELAY_TOLERANCE_DAYS, type TrustFacts, trustScore } from "@/lib/trust-score";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";

export async function trustFacts(db: Queryable, orgId: string): Promise<TrustFacts> {
  const r = await one<Record<string, unknown>>(
    db,
    `WITH rec AS (
       SELECT r.job_id, r.decision, r.reception_date, j.end_date FROM job_receptions r JOIN jobs j ON j.id=r.job_id
       WHERE r.org_id=$1 AND r.decision <> 'refus')
     SELECT
       (SELECT count(*) FROM rec) AS received,
       (SELECT count(*) FROM rec WHERE decision='sans_reserve') AS clean,
       (SELECT count(*) FROM job_reserves v WHERE v.job_id IN (SELECT job_id FROM rec)) AS reserves,
       (SELECT count(*) FROM job_reserves v WHERE v.job_id IN (SELECT job_id FROM rec) AND v.lifted_at IS NOT NULL) AS lifted,
       (SELECT count(*) FROM rec WHERE end_date IS NOT NULL) AS planned,
       (SELECT count(*) FROM rec WHERE end_date IS NOT NULL AND reception_date <= end_date + ${DELAY_TOLERANCE_DAYS}) AS on_time,
       (SELECT coalesce(json_agg(c.rating), '[]'::json) FROM customer_reviews c
          WHERE c.org_id=$1 AND c.submitted_at IS NOT NULL AND c.rating IS NOT NULL AND c.hidden_reason='' AND c.job_id IN (SELECT job_id FROM rec)) AS ratings,
       o.siret, o.insurance_decennale
     FROM organizations o WHERE o.id=$1`,
    [orgId],
  );
  const ratings = (typeof r?.ratings === "string" ? JSON.parse(r.ratings) : (r?.ratings ?? [])) as unknown[];
  return {
    receivedJobs: num(r?.received),
    cleanReceptions: num(r?.clean),
    reservesTotal: num(r?.reserves),
    reservesLifted: num(r?.lifted),
    jobsWithPlannedEnd: num(r?.planned),
    jobsOnTime: num(r?.on_time),
    ratings: ratings.map(Number),
    insured: !!r?.insurance_decennale,
    registered: !!String(r?.siret ?? "").trim(),
  };
}

export async function myTrustScore(ctx: Ctx) {
  const [facts, s] = await Promise.all([
    trustFacts(ctx.db, ctx.orgId),
    one<{ show_trust: boolean; enabled: boolean; slug: string }>(ctx.db, "SELECT show_trust, enabled, slug FROM showcases WHERE org_id=$1", [ctx.orgId]),
  ]);
  return { ...trustScore(facts), shown: !!s?.show_trust, showcase: s ? { enabled: s.enabled, slug: s.slug } : null };
}

/** Choix d'afficher la note sur la vitrine ; la note n'y apparaît qu'une fois calculable. */
export async function setTrustShown(ctx: Ctx, shown: boolean) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  const r = await ctx.db.query("UPDATE showcases SET show_trust=$2, updated_at=now() WHERE org_id=$1 RETURNING org_id", [ctx.orgId, shown]);
  if (!r.length) throw badRequest("Créez d'abord votre vitrine dans Entreprise");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "trust.display", data: { shown } });
}

/** Note publique : seulement si l'artisan l'a choisi et si elle repose sur assez de chantiers. */
export async function publicTrust(db: Queryable, orgId: string, shown: boolean) {
  if (!shown) return null;
  const t = trustScore(await trustFacts(db, orgId));
  return t.score == null ? null : t;
}
