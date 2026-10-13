/**
 * File de tâches en arrière-plan (à ne pas confondre avec les chantiers de jobs.ts).
 *
 * Une tâche est enregistrée dans la même transaction que l'action qui la demande, puis exécutée par la tâche
 * planifiée POST /api/cron/jobs. Une tâche qui échoue est reprise plus tard, à intervalles croissants
 * (1, 2, 4, 8 minutes, jusqu'à 6 heures). Après le dernier essai elle est abandonnée, signalée à
 * l'administration, et peut être relancée à la main depuis la page de statut.
 * Une tâche dont l'exécution a été interrompue (redémarrage du serveur) est reprise à l'expiration de son verrou.
 */

import type { Database, Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { sendAlert } from "@/lib/monitoring";

export type JobStatus = "pending" | "running" | "done" | "dead";
export const JOB_STATUSES: Record<JobStatus, string> = {
  pending: "En attente",
  running: "En cours",
  done: "Terminée",
  dead: "Abandonnée",
};

export interface Job {
  id: string;
  orgId: string | null;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
}

export type JobHandler = (db: Database, job: Job) => Promise<void>;

/** Erreur définitive : la tâche est abandonnée sans nouvel essai. */
export class PermanentJobError extends Error {}

const LOCK_MS = 5 * 60_000;
const MAX_DELAY_MS = 6 * 3600_000;

/** Délai avant l'essai suivant, après `attempts` essais : 1 min, 2, 4, 8... plafonné à 6 h. */
export function retryDelayMs(attempts: number) {
  return Math.min(60_000 * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
}

export async function enqueueJob(
  q: Queryable,
  kind: string,
  payload: Record<string, unknown>,
  opts: { orgId?: string | null; runAt?: Date; maxAttempts?: number; dedupeKey?: string } = {},
): Promise<string | null> {
  const r = await one<{ id: string }>(
    q,
    `INSERT INTO background_jobs (org_id, kind, payload, run_at, max_attempts, dedupe_key) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [opts.orgId ?? null, kind, JSON.stringify(payload), opts.runAt ?? new Date(), opts.maxAttempts ?? 6, opts.dedupeKey ?? null],
  );
  return r?.id ?? null;
}

/** Exécute les tâches arrivées à échéance. Plusieurs exécutions simultanées ne prennent jamais la même tâche. */
export async function runJobs(db: Database, handlers: Record<string, JobHandler>, opts: { now?: Date; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const claimed = await db.query<Record<string, unknown>>(
    `UPDATE background_jobs SET status='running', attempts=attempts+1, locked_until=$2
     WHERE id IN (
       SELECT id FROM background_jobs
       WHERE (status='pending' AND run_at <= $1) OR (status='running' AND locked_until < $1)
       ORDER BY run_at LIMIT $3 FOR UPDATE SKIP LOCKED
     ) RETURNING id, org_id, kind, payload, attempts, max_attempts`,
    [now, new Date(now.getTime() + LOCK_MS), opts.limit ?? 50],
  );
  const result = { done: 0, retried: 0, dead: 0 };
  for (const r of claimed) {
    const job: Job = {
      id: String(r.id),
      orgId: r.org_id ? String(r.org_id) : null,
      kind: String(r.kind),
      payload: (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) as Record<string, unknown>,
      attempts: num(r.attempts),
      maxAttempts: num(r.max_attempts),
    };
    const handler = handlers[job.kind];
    try {
      if (!handler) throw new PermanentJobError(`Type de tâche inconnu : ${job.kind}`);
      await handler(db, job);
      await db.query("UPDATE background_jobs SET status='done', finished_at=$2, locked_until=NULL, last_error=NULL WHERE id=$1", [job.id, now]);
      result.done++;
    } catch (e) {
      const message = ((e as Error).message || "Erreur inconnue").slice(0, 500);
      if (e instanceof PermanentJobError || job.attempts >= job.maxAttempts) {
        await db.query("UPDATE background_jobs SET status='dead', finished_at=$2, locked_until=NULL, last_error=$3 WHERE id=$1", [job.id, now, message]);
        await sendAlert(`Pilot-Makers : tâche ${job.kind} abandonnée après ${job.attempts} essai(s) : ${message}`);
        result.dead++;
      } else {
        await db.query("UPDATE background_jobs SET status='pending', run_at=$2, locked_until=NULL, last_error=$3 WHERE id=$1", [
          job.id,
          new Date(now.getTime() + retryDelayMs(job.attempts)),
          message,
        ]);
        result.retried++;
      }
    }
  }
  return result;
}

export async function jobStats(db: Queryable) {
  const rows = await db.query<{ status: JobStatus; n: unknown; oldest: Date | string | null }>(
    "SELECT status, count(*) AS n, min(run_at) AS oldest FROM background_jobs GROUP BY status",
  );
  const counts: Record<JobStatus, number> = { pending: 0, running: 0, done: 0, dead: 0 };
  let oldestPending: Date | null = null;
  for (const r of rows) {
    counts[r.status] = num(r.n);
    if (r.status === "pending" && r.oldest) oldestPending = new Date(r.oldest);
  }
  return { counts, oldestPending };
}

/** Les tâches terminées sont gardées 30 jours, les abandonnées 90 jours. */
export async function purgeJobs(db: Queryable, now = new Date()) {
  const day = 86_400_000;
  const rows = await db.query<{ id: string }>(
    "DELETE FROM background_jobs WHERE (status='done' AND finished_at < $1) OR (status='dead' AND finished_at < $2) RETURNING id",
    [new Date(now.getTime() - 30 * day), new Date(now.getTime() - 90 * day)],
  );
  return rows.length;
}
