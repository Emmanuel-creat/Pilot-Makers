/**
 * Messagerie d'équipe d'un chantier : consignes, questions et réponses entre le bureau et les
 * compagnons, au même endroit que le journal. Les personnes affectées au chantier et celles qui
 * ont déjà écrit sont prévenues sur leur téléphone à chaque nouveau message.
 */

import { num } from "@/lib/db";
import { badRequest, forbidden, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { can, requireWritable } from "./context";
import { getJob } from "./jobs";
import { notifyUsers } from "./push";

export const MESSAGE_MAX_LENGTH = 2000;

export interface JobMessage {
  id: string;
  body: string;
  createdAt: Date;
  userId: string | null;
  authorName: string;
  mine: boolean;
}

/** Messages du chantier, du plus ancien au plus récent ; les marque comme lus pour la personne connectée. */
export async function listJobMessages(ctx: Ctx, jobId: string, opts: { markRead?: boolean } = {}): Promise<JobMessage[]> {
  await getJob(ctx, jobId);
  const rows = await ctx.db.query<{ id: string; body: string; created_at: Date; user_id: string | null; name: string | null }>(
    `SELECT m.id, m.body, m.created_at, m.user_id, u.name FROM job_messages m LEFT JOIN users u ON u.id=m.user_id
     WHERE m.org_id=$1 AND m.job_id=$2 ORDER BY m.created_at, m.id LIMIT 500`,
    [ctx.orgId, jobId],
  );
  if (opts.markRead !== false && !ctx.supportAccess) {
    await ctx.db.query(
      `INSERT INTO job_message_reads (job_id, user_id, read_at) VALUES ($1,$2,now())
       ON CONFLICT (job_id, user_id) DO UPDATE SET read_at=now()`,
      [jobId, ctx.userId],
    );
  }
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    createdAt: new Date(r.created_at),
    userId: r.user_id,
    authorName: r.name?.trim() || "Ancien membre",
    mine: r.user_id === ctx.userId,
  }));
}

export async function postJobMessage(ctx: Ctx, jobId: string, body: string): Promise<string> {
  requireWritable(ctx);
  const job = await getJob(ctx, jobId);
  const text = String(body ?? "").trim();
  if (!text) throw badRequest("Écrivez un message");
  if (text.length > MESSAGE_MAX_LENGTH) throw badRequest(`Message trop long (${MESSAGE_MAX_LENGTH} caractères au plus)`);
  const [row] = await ctx.db.query<{ id: string }>("INSERT INTO job_messages (org_id, job_id, user_id, body) VALUES ($1,$2,$3,$4) RETURNING id", [
    ctx.orgId,
    jobId,
    ctx.userId,
    text,
  ]);
  await ctx.db.query(
    `INSERT INTO job_message_reads (job_id, user_id, read_at) VALUES ($1,$2,now()) ON CONFLICT (job_id, user_id) DO UPDATE SET read_at=now()`,
    [jobId, ctx.userId],
  );
  const people = await ctx.db.query<{ user_id: string }>(
    `SELECT resource_id AS user_id FROM job_assignments WHERE org_id=$1 AND job_id=$2 AND resource_type='user'
     UNION SELECT user_id FROM job_messages WHERE org_id=$1 AND job_id=$2 AND user_id IS NOT NULL`,
    [ctx.orgId, jobId],
  );
  const to = [...new Set(people.map((p) => p.user_id))].filter((id) => id !== ctx.userId);
  const author = await ctx.db.query<{ name: string }>("SELECT name FROM users WHERE id=$1", [ctx.userId]);
  await notifyUsers(ctx.db, ctx.orgId, to, {
    title: job.job.title || "Chantier",
    body: `${author[0]?.name?.trim() || "Un membre de l'équipe"} : ${text.length > 120 ? `${text.slice(0, 117)}...` : text}`,
    url: `/app/chantiers/${jobId}#messages`,
  });
  return row.id;
}

/** L'auteur retire son message ; un responsable peut retirer n'importe quel message. */
export async function deleteJobMessage(ctx: Ctx, id: string) {
  requireWritable(ctx);
  const [m] = await ctx.db.query<{ user_id: string | null }>("SELECT user_id FROM job_messages WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
  if (!m) throw notFound("Message introuvable");
  if (m.user_id !== ctx.userId && !can(ctx, "settings")) throw forbidden("Seul l'auteur peut retirer ce message");
  await ctx.db.query("DELETE FROM job_messages WHERE id=$1 AND org_id=$2", [id, ctx.orgId]);
}

/** Messages non lus par la personne connectée, par chantier. */
export async function unreadJobMessages(ctx: Ctx): Promise<Map<string, number>> {
  const rows = await ctx.db.query<{ job_id: string; n: unknown }>(
    `SELECT m.job_id, count(*) AS n FROM job_messages m
     LEFT JOIN job_message_reads r ON r.job_id=m.job_id AND r.user_id=$2
     WHERE m.org_id=$1 AND m.user_id IS DISTINCT FROM $2 AND (r.read_at IS NULL OR m.created_at > r.read_at)
     GROUP BY m.job_id`,
    [ctx.orgId, ctx.userId],
  );
  return new Map(rows.map((r) => [r.job_id, num(r.n)]));
}
