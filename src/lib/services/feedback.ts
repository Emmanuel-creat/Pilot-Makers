/** Retours des utilisateurs : envoi depuis chaque page, synthèse hebdomadaire et suivi pour l'administration. */

import { z } from "zod";
import { one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import { areaOf, type FeedbackRow, weeklyFeedback } from "@/lib/feedback";
import { requirePlatformAdmin } from "./admin";
import type { Ctx } from "./context";
import { parisDate } from "./quotes";

const schema = z.object({
  path: z.string().trim().max(300).startsWith("/app", "Page inconnue"),
  useful: z.boolean(),
  comment: z.string().trim().max(1000, "Commentaire trop long (1 000 caractères au plus)").default(""),
});

/** Un retour par personne, par rubrique et par jour : un nouvel envoi remplace celui du jour. */
export async function sendFeedback(ctx: Ctx, raw: unknown) {
  const p = schema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const path = p.data.path.split(/[?#]/)[0].replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id");
  await ctx.db.query(
    `INSERT INTO page_feedback (org_id, user_id, area, path, useful, comment, day) VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (user_id, area, day) DO UPDATE SET path=EXCLUDED.path, useful=EXCLUDED.useful,
       comment=CASE WHEN EXCLUDED.comment <> '' THEN EXCLUDED.comment ELSE page_feedback.comment END, status='nouveau', created_at=now()`,
    [ctx.orgId, ctx.userId, areaOf(path), path, p.data.useful, p.data.comment, parisDate(new Date())],
  );
}

/** Semaine en cours comparée à la précédente, et commentaires à traiter. */
export async function feedbackReport(ctx: Ctx, now = new Date()) {
  requirePlatformAdmin(ctx);
  const rows = await ctx.db.query<{ area: string; useful: boolean; created_at: Date }>(
    "SELECT area, useful, created_at FROM page_feedback WHERE created_at > $1::timestamptz - interval '14 days'",
    [now.toISOString()],
  );
  const data: FeedbackRow[] = rows.map((r) => ({ area: r.area, useful: r.useful, createdAt: new Date(r.created_at).toISOString() }));
  const comments = await ctx.db.query<{
    id: string;
    area: string;
    path: string;
    useful: boolean;
    comment: string;
    status: string;
    response: string;
    created_at: Date;
  }>(
    "SELECT id, area, path, useful, comment, status, response, created_at FROM page_feedback WHERE comment <> '' ORDER BY (status='nouveau') DESC, created_at DESC LIMIT 100",
  );
  return { ...weeklyFeedback(data, now), comments };
}

/** Marque un commentaire comme traité, avec la réponse ou la décision prise. */
export async function resolveFeedback(ctx: Ctx, id: string, response: string) {
  requirePlatformAdmin(ctx);
  const r = isUuid(id)
    ? await ctx.db.query("UPDATE page_feedback SET status='traite', response=$2 WHERE id=$1 RETURNING id", [id, response.trim().slice(0, 1000)])
    : [];
  if (!r.length) throw notFound("Retour introuvable");
}

/** Mes retours et les réponses reçues */
export async function myFeedback(ctx: Ctx) {
  return ctx.db.query<{ id: string; area: string; useful: boolean; comment: string; status: string; response: string; created_at: Date }>(
    "SELECT id, area, useful, comment, status, response, created_at FROM page_feedback WHERE user_id=$1 AND comment <> '' ORDER BY created_at DESC LIMIT 20",
    [ctx.userId],
  );
}

export async function feedbackCount(ctx: Ctx) {
  return Number((await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM page_feedback WHERE user_id=$1", [ctx.userId]))?.n ?? 0);
}
