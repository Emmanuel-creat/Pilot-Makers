/**
 * Notifications sur le téléphone : devis consulté, accepté ou refusé, message d'un client, réponse d'un
 * sous-traitant, nouvelle demande de devis. Chaque personne active les notifications appareil par appareil
 * depuis Mon compte ; elles complètent l'e-mail sans le remplacer.
 *
 * L'envoi passe par la file de tâches : un service de notifications indisponible est réessayé, un appareil
 * désabonné est oublié.
 */

import { z } from "zod";
import type { Database, Queryable } from "@/lib/db";
import { one } from "@/lib/db";
import { badRequest, forbidden, isUuid, notFound } from "@/lib/http";
import { open, seal } from "@/lib/secret-box";
import { generateVapidKeys, sendPush, type VapidKeys } from "@/lib/web-push";
import type { Ctx } from "./context";
import { audit } from "./context";
import { PermanentJobError, enqueueJob, type JobHandler } from "./task-queue";

export const PUSH_JOB = "push.send";
export const PUSH_DEVICES_MAX = 10;

export interface PushMessage {
  title: string;
  body: string;
  url?: string;
}

/** Clés VAPID : VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY, sinon créées une fois et gardées chiffrées en base. */
export async function vapidKeys(q: Queryable): Promise<VapidKeys> {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  }
  const row = await one<{ value: string }>(q, "SELECT value FROM platform_keys WHERE name='vapid'");
  if (row) return JSON.parse(open(row.value)) as VapidKeys;
  const keys = generateVapidKeys();
  await q.query("INSERT INTO platform_keys (name, value) VALUES ('vapid', $1) ON CONFLICT (name) DO NOTHING", [seal(JSON.stringify(keys))]);
  const stored = await one<{ value: string }>(q, "SELECT value FROM platform_keys WHERE name='vapid'");
  return JSON.parse(open(stored!.value)) as VapidKeys;
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(1000).startsWith("https://", "Adresse de notification invalide"),
  keys: z.object({ p256dh: z.string().min(80).max(200), auth: z.string().min(16).max(64) }),
});

function requireOwnAccount(ctx: Ctx) {
  if (ctx.supportAccess) throw forbidden("L'accès support ne peut pas gérer les notifications");
}

export async function subscribePush(ctx: Ctx, raw: unknown, device = "") {
  requireOwnAccount(ctx);
  const p = subscriptionSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const n = await one<{ n: string }>(ctx.db, "SELECT count(*) AS n FROM push_subscriptions WHERE user_id=$1 AND endpoint<>$2", [ctx.userId, p.data.endpoint]);
  if (Number(n?.n) >= PUSH_DEVICES_MAX) throw badRequest(`${PUSH_DEVICES_MAX} appareils au plus : retirez-en un d'abord`);
  // Le même appareil peut passer d'un compte à un autre : l'abonnement suit la personne connectée.
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device) VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (endpoint) DO UPDATE SET user_id=$1, p256dh=$3, auth=$4, device=$5 RETURNING id`,
    [ctx.userId, p.data.endpoint, p.data.keys.p256dh, p.data.keys.auth, device.slice(0, 120)],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "push.subscribe", target: r!.id, ip: ctx.ip });
  return r!.id;
}

export async function listPushDevices(ctx: Ctx) {
  const rows = await ctx.db.query<{ id: string; device: string; created_at: Date | string; last_success_at: Date | string | null }>(
    "SELECT id, device, created_at, last_success_at FROM push_subscriptions WHERE user_id=$1 ORDER BY created_at",
    [ctx.userId],
  );
  const iso = (v: Date | string | null) => (v instanceof Date ? v.toISOString() : v);
  return rows.map((r) => ({ id: r.id, device: r.device || "Appareil", createdAt: iso(r.created_at)!, lastSuccessAt: iso(r.last_success_at) }));
}

export async function removePushDevice(ctx: Ctx, id: string) {
  requireOwnAccount(ctx);
  if (!isUuid(id)) throw notFound("Appareil introuvable");
  const r = await one(ctx.db, "DELETE FROM push_subscriptions WHERE id=$1 AND user_id=$2 RETURNING id", [id, ctx.userId]);
  if (!r) throw notFound("Appareil introuvable");
}

export async function unsubscribePush(ctx: Ctx, endpoint: string) {
  await ctx.db.query("DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id=$2", [String(endpoint ?? ""), ctx.userId]);
}

async function enqueueFor(q: Queryable, ids: string[], orgId: string | null, msg: PushMessage) {
  for (const id of ids) await enqueueJob(q, PUSH_JOB, { subscriptionId: id, message: msg }, { orgId, maxAttempts: 4 });
  return ids.length;
}

/** Prévient sur leur téléphone les membres actifs de l'entreprise (hors expert-comptable). */
export async function notifyOrg(q: Queryable, orgId: string, msg: PushMessage) {
  const subs = await q.query<{ id: string }>(
    `SELECT s.id FROM push_subscriptions s JOIN memberships m ON m.user_id=s.user_id
     WHERE m.org_id=$1 AND (m.job_function IS NULL OR m.job_function <> 'comptable')`,
    [orgId],
  );
  return enqueueFor(q, subs.map((s) => s.id), orgId, msg);
}

/** Notification d'essai sur tous les appareils de la personne connectée. */
export async function testPush(ctx: Ctx) {
  const subs = await ctx.db.query<{ id: string }>("SELECT id FROM push_subscriptions WHERE user_id=$1", [ctx.userId]);
  if (!subs.length) throw badRequest("Activez d'abord les notifications sur cet appareil");
  return enqueueFor(ctx.db, subs.map((s) => s.id), ctx.orgId, { title: "Pilot-Makers", body: "Les notifications fonctionnent sur cet appareil.", url: "/app/compte" });
}

/** Tâche d'envoi d'une notification. */
export function pushJobHandler(fetchImpl?: typeof fetch): JobHandler {
  return async (db: Database, job) => {
    const sub = await one<{ id: string; endpoint: string; p256dh: string; auth: string }>(
      db,
      "SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE id=$1",
      [String(job.payload.subscriptionId ?? "")],
    );
    if (!sub) return;
    const r = await sendPush(sub, job.payload.message as PushMessage, await vapidKeys(db), { fetchImpl, subject: process.env.VAPID_SUBJECT });
    if (r.outcome === "sent") await db.query("UPDATE push_subscriptions SET last_success_at=now() WHERE id=$1", [sub.id]);
    else if (r.outcome === "gone") await db.query("DELETE FROM push_subscriptions WHERE id=$1", [sub.id]);
    else if (r.outcome === "retry") throw new Error(`Service de notifications indisponible (HTTP ${r.status})`);
    else throw new PermanentJobError(`Notification refusée (HTTP ${r.status})`);
  };
}
