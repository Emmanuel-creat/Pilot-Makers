/** Avis clients : invitation après chantier, dépôt par le client, publication sur la vitrine. */

import { z } from "zod";
import { one, type Queryable } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/http";
import { hitRate } from "@/lib/rate-limit";
import { averageRating, displayName, HIDE_REASONS, type HideReason } from "@/lib/reviews";
import { randomToken, sha256 } from "@/lib/security";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { getJob } from "./jobs";
import { appUrl, sendMail } from "./mail";

export interface Review {
  id: string;
  jobId: string;
  jobTitle: string;
  authorName: string;
  city: string;
  workDate: string | null;
  rating: number | null;
  comment: string;
  publishConsent: boolean;
  requestedAt: Date;
  submittedAt: Date | null;
  hiddenReason: HideReason | "";
  reply: string;
}

const dateOf = (v: unknown) => (v ? (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10) : null);

function mapRow(r: Record<string, unknown>): Review {
  return {
    id: String(r.id),
    jobId: String(r.job_id),
    jobTitle: String(r.job_title ?? ""),
    authorName: String(r.author_name ?? ""),
    city: String(r.city ?? ""),
    workDate: dateOf(r.work_date),
    rating: r.rating == null ? null : Number(r.rating),
    comment: String(r.comment ?? ""),
    publishConsent: Boolean(r.publish_consent),
    requestedAt: new Date(r.requested_at as string),
    submittedAt: r.submitted_at ? new Date(r.submitted_at as string) : null,
    hiddenReason: (String(r.hidden_reason ?? "") as HideReason) || "",
    reply: String(r.reply ?? ""),
  };
}

const SELECT = `SELECT r.*, j.title AS job_title FROM customer_reviews r JOIN jobs j ON j.id=r.job_id`;

export async function listReviews(ctx: Ctx): Promise<Review[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(`${SELECT} WHERE r.org_id=$1 ORDER BY coalesce(r.submitted_at, r.requested_at) DESC LIMIT 500`, [
    ctx.orgId,
  ]);
  return rows.map(mapRow);
}

export async function jobReview(ctx: Ctx, jobId: string): Promise<Review | null> {
  const rows = await ctx.db.query<Record<string, unknown>>(`${SELECT} WHERE r.org_id=$1 AND r.job_id=$2`, [ctx.orgId, jobId]);
  return rows.length ? mapRow(rows[0]) : null;
}

/**
 * Invite le client à donner son avis sur le chantier. Le lien est créé une fois par chantier ;
 * une nouvelle demande renvoie un nouveau lien tant que l'avis n'est pas déposé.
 */
export async function requestReview(ctx: Ctx, jobId: string, opts: { send?: boolean } = {}): Promise<{ url: string; emailed: boolean }> {
  requireWritable(ctx);
  const { job } = await getJob(ctx, jobId);
  const existing = await jobReview(ctx, jobId);
  if (existing?.submittedAt) throw conflict("Le client a déjà donné son avis sur ce chantier");
  const customer = job.customer_id
    ? await one<{ type: string; first_name: string; last_name: string; company_name: string; email: string }>(
        ctx.db,
        "SELECT type, first_name, last_name, company_name, email FROM customers WHERE id=$1 AND org_id=$2",
        [job.customer_id, ctx.orgId],
      )
    : null;
  const reception = await one<{ reception_date: unknown }>(ctx.db, "SELECT reception_date FROM job_receptions WHERE job_id=$1", [jobId]);
  const token = randomToken(24);
  const author = customer ? displayName(customer) : "Client";
  await ctx.db.query(
    `INSERT INTO customer_reviews (org_id, job_id, token_hash, author_name, city, work_date) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (job_id) DO UPDATE SET token_hash=excluded.token_hash, author_name=excluded.author_name, city=excluded.city,
       work_date=excluded.work_date, requested_at=now()`,
    [ctx.orgId, jobId, sha256(token), author, job.site_city ?? "", dateOf(reception?.reception_date) ?? dateOf(job.end_date) ?? null],
  );
  const url = appUrl(`/avis/${token}`);
  let emailed = false;
  if (opts.send && customer?.email) {
    await hitRate(ctx.db, "mail.send", ctx.orgId);
    const org = await one<{ trade_name: string }>(ctx.db, "SELECT trade_name FROM organizations WHERE id=$1", [ctx.orgId]);
    await sendMail(ctx.db, {
      orgId: ctx.orgId,
      kind: "review_request",
      to: customer.email,
      subject: `Votre avis sur les travaux réalisés par ${org?.trade_name ?? "notre entreprise"}`,
      body:
        `Bonjour,\n\nNous espérons que vous êtes satisfait des travaux « ${job.title} ». Votre avis nous aide à progresser et à nous faire connaître : ` +
        `il ne prend qu'une minute.\n\n${url}\n\nMerci de votre confiance,\n${org?.trade_name ?? ""}`,
    });
    emailed = true;
  }
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "review.request", target: jobId, data: { emailed }, ip: ctx.ip });
  return { url, emailed };
}

async function byToken(db: Queryable, token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const rows = await db.query<Record<string, unknown>>(
    `SELECT r.*, j.title AS job_title, o.trade_name, o.status AS org_status FROM customer_reviews r JOIN jobs j ON j.id=r.job_id
     JOIN organizations o ON o.id=r.org_id WHERE r.token_hash=$1`,
    [sha256(token)],
  );
  return rows.length && rows[0].org_status === "active" ? { review: mapRow(rows[0]), orgName: String(rows[0].trade_name ?? "") } : null;
}

export async function reviewInvitation(db: Queryable, token: string) {
  return byToken(db, token);
}

const submitSchema = z.object({
  rating: z.coerce.number().int().min(1, "Choisissez une note de 1 à 5").max(5, "Choisissez une note de 1 à 5"),
  comment: z.string().trim().max(2000, "Avis trop long (2 000 caractères au plus)").default(""),
  publish: z.boolean().default(false),
});

export async function submitReview(db: Queryable, token: string, raw: unknown, meta: { ip: string }) {
  await hitRate(db, "public.respond", meta.ip);
  const found = await byToken(db, token);
  if (!found) throw notFound("Lien invalide ou expiré");
  if (found.review.submittedAt) throw conflict("Votre avis a déjà été enregistré. Merci !");
  const p = submitSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  await db.query("UPDATE customer_reviews SET rating=$2, comment=$3, publish_consent=$4, submitted_at=now() WHERE id=$1", [
    found.review.id,
    p.data.rating,
    p.data.comment,
    p.data.publish,
  ]);
}

/** Masque un avis pour un motif admis, ou le rétablit (motif vide). */
export async function hideReview(ctx: Ctx, id: string, reason: string) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  if (reason && !(reason in HIDE_REASONS))
    throw badRequest("Motif non admis : un avis ne peut être masqué que s'il est injurieux, hors sujet ou s'il cite un tiers");
  const r = await ctx.db.query("UPDATE customer_reviews SET hidden_reason=$3 WHERE id=$1 AND org_id=$2 AND submitted_at IS NOT NULL RETURNING id", [
    id,
    ctx.orgId,
    reason,
  ]);
  if (!r.length) throw notFound("Avis introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: reason ? "review.hide" : "review.show", target: id, data: { reason }, ip: ctx.ip });
}

/** Réponse publique de l'entreprise sous l'avis. */
export async function replyReview(ctx: Ctx, id: string, text: string) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const reply = String(text ?? "").trim();
  if (reply.length > 1000) throw badRequest("Réponse trop longue (1 000 caractères au plus)");
  const r = await ctx.db.query("UPDATE customer_reviews SET reply=$3 WHERE id=$1 AND org_id=$2 AND submitted_at IS NOT NULL RETURNING id", [
    id,
    ctx.orgId,
    reply,
  ]);
  if (!r.length) throw notFound("Avis introuvable");
}

export interface PublicReview {
  authorName: string;
  city: string;
  rating: number;
  comment: string;
  reply: string;
  submittedAt: string;
  workDate: string | null;
}

/** Avis publiés sur la vitrine : déposés, acceptés pour publication par le client, non masqués. */
export async function publicReviews(db: Queryable, orgId: string): Promise<{ reviews: PublicReview[]; average: number | null; count: number }> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT author_name, city, rating, comment, reply, submitted_at, work_date FROM customer_reviews
     WHERE org_id=$1 AND submitted_at IS NOT NULL AND publish_consent AND hidden_reason='' ORDER BY submitted_at DESC LIMIT 50`,
    [orgId],
  );
  const reviews = rows.map((r) => ({
    authorName: String(r.author_name),
    city: String(r.city ?? ""),
    rating: Number(r.rating),
    comment: String(r.comment ?? ""),
    reply: String(r.reply ?? ""),
    submittedAt: dateOf(r.submitted_at)!,
    workDate: dateOf(r.work_date),
  }));
  return { reviews, ...averageRating(reviews.map((r) => r.rating)) };
}
