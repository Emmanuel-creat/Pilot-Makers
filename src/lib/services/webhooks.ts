/**
 * Webhooks : l'entreprise abonne une adresse HTTPS à des événements (devis signé, facture payée, client créé).
 *
 * Les événements sont écrits dans la file webhook_deliveries dans la même transaction que l'action
 * (rien n'est envoyé pour une action annulée), puis envoyés par la tâche planifiée POST /api/cron/webhooks.
 * Chaque envoi est signé : en-tête Pilot-Makers-Signature "t=<horodatage>,v1=<HMAC-SHA256 de "t.corps">".
 * Échec : nouvel essai après 1, 2, 4... minutes, 8 tentatives au plus.
 */

import { isIP } from "node:net";
import { z } from "zod";
import { num, one, type Database, type Queryable } from "@/lib/db";
import { badRequest, conflict, notFound } from "@/lib/http";
import { hmacSha256, randomToken } from "@/lib/security";
import { open, seal } from "@/lib/secret-box";
import type { Ctx } from "./context";
import { audit, requireRole, requireWritable } from "./context";
import { requireFeature } from "./features";

export const WEBHOOK_EVENTS = {
  "quote.accepted": "Devis signé",
  "invoice.paid": "Facture payée",
  "customer.created": "Client créé",
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;

export const WEBHOOK_MAX_ENDPOINTS = 25;
export const WEBHOOK_MAX_ATTEMPTS = 8;
const TIMEOUT_MS = 10_000;

/* ------------------------------------------------------------------ */
/* Adresse de destination                                              */
/* ------------------------------------------------------------------ */

function privateIp(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  const v = isIP(h);
  if (v === 4) {
    const [a, b] = h.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (v === 6) return h === "::" || h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80") || h.startsWith("::ffff:");
  return false;
}

/** Adresse publique en HTTPS uniquement : pas de réseau interne ni de nom local. */
export function checkWebhookUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw badRequest("Adresse invalide");
  }
  if (u.protocol !== "https:") throw badRequest("L'adresse doit commencer par https://");
  if (u.username || u.password) throw badRequest("L'adresse ne doit pas contenir d'identifiants");
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") ||
    privateIp(host)
  ) {
    throw badRequest("L'adresse doit être publique : les réseaux internes ne sont pas autorisés");
  }
  if (u.port && u.port !== "443") throw badRequest("Seul le port HTTPS standard (443) est accepté");
  u.hash = "";
  return u.toString();
}

/* ------------------------------------------------------------------ */
/* Abonnements                                                         */
/* ------------------------------------------------------------------ */

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  created_at: Date;
  label: string;
  /** Abonnement créé par un outil d'automatisation avec cette clé d'API */
  api_key_id: string | null;
  api_key_name: string | null;
}

const endpointSchema = z.object({
  url: z.string().trim().min(1, "Adresse requise").max(500),
  events: z.array(z.enum(Object.keys(WEBHOOK_EVENTS) as [WebhookEvent, ...WebhookEvent[]])).min(1, "Choisissez au moins un événement"),
  label: z.string().trim().max(80).optional().default(""),
});

export async function listEndpoints(ctx: Ctx): Promise<WebhookEndpoint[]> {
  return ctx.db.query<WebhookEndpoint>(
    `SELECT e.id, e.url, e.events, e.active, e.created_at, e.label, e.api_key_id, k.name AS api_key_name
     FROM webhook_endpoints e LEFT JOIN api_keys k ON k.id=e.api_key_id WHERE e.org_id=$1 ORDER BY e.created_at`,
    [ctx.orgId],
  );
}

/** Crée l'abonnement et renvoie la clé de signature, affichée une seule fois. */
export async function createEndpoint(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  await requireFeature(ctx, "webhooks");
  const p = endpointSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const url = checkWebhookUrl(p.data.url);
  const count = await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM webhook_endpoints WHERE org_id=$1", [ctx.orgId]);
  if (num(count?.n) >= WEBHOOK_MAX_ENDPOINTS) throw conflict(`${WEBHOOK_MAX_ENDPOINTS} adresses au plus`);
  const secret = `whsec_${randomToken(24)}`;
  const row = await one<{ id: string }>(
    ctx.db,
    "INSERT INTO webhook_endpoints (org_id, url, events, secret, label, api_key_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [ctx.orgId, url, [...new Set(p.data.events)], seal(secret), p.data.label, ctx.apiKey?.id ?? null],
  );
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "webhook.create",
    target: row!.id,
    data: { url, events: p.data.events },
    ip: ctx.ip,
  });
  return { id: row!.id, secret };
}

export async function deleteEndpoint(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  const r = await ctx.db.query<{ id: string }>("DELETE FROM webhook_endpoints WHERE id=$1 AND org_id=$2 RETURNING id", [id, ctx.orgId]);
  if (!r.length) throw notFound("Adresse introuvable");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "webhook.delete", target: id, ip: ctx.ip });
}

export async function setEndpointActive(ctx: Ctx, id: string, active: boolean) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  const r = await ctx.db.query<{ id: string }>("UPDATE webhook_endpoints SET active=$3 WHERE id=$1 AND org_id=$2 RETURNING id", [
    id,
    ctx.orgId,
    active,
  ]);
  if (!r.length) throw notFound("Adresse introuvable");
}

/* ------------------------------------------------------------------ */
/* File d'envoi                                                        */
/* ------------------------------------------------------------------ */

/** Ajoute l'événement à la file, pour chaque adresse active abonnée. À appeler dans la transaction de l'action. */
export async function enqueueWebhook(q: Queryable, orgId: string, event: WebhookEvent | "ping", data: Record<string, unknown>, endpointId?: string) {
  const endpoints = await q.query<{ id: string }>(
    endpointId
      ? "SELECT id FROM webhook_endpoints WHERE org_id=$1 AND id=$2"
      : "SELECT id FROM webhook_endpoints WHERE org_id=$1 AND active AND $2 = ANY(events)",
    [orgId, endpointId ?? event],
  );
  for (const e of endpoints) {
    await q.query("INSERT INTO webhook_deliveries (org_id, endpoint_id, event, payload) VALUES ($1,$2,$3,$4)", [
      orgId,
      e.id,
      event,
      JSON.stringify({ type: event, created_at: new Date().toISOString(), data }),
    ]);
  }
  return endpoints.length;
}

export function signature(secret: string, timestamp: number, body: string) {
  return `t=${timestamp},v1=${hmacSha256(secret, `${timestamp}.${body}`)}`;
}

/** Délai avant le nouvel essai : 1, 2, 4... minutes, plafonné à 2 heures. */
export function retryDelayMs(attempts: number) {
  return Math.min(2 ** Math.max(attempts - 1, 0), 120) * 60_000;
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

/** Envoie les événements dus. Renvoie le nombre d'envois réussis et échoués. */
export async function deliverWebhooks(db: Database, opts: { now?: Date; fetchImpl?: Fetch; limit?: number; orgId?: string } = {}) {
  const now = opts.now ?? new Date();
  const doFetch: Fetch = opts.fetchImpl ?? ((url, init) => fetch(url, init));
  const due = await db.query<{
    id: string;
    org_id: string;
    event: string;
    payload: unknown;
    attempts: unknown;
    url: string;
    secret: string;
    active: boolean;
    endpoint_id: string;
    api_key_id: string | null;
  }>(
    `SELECT d.id, d.org_id, d.event, d.payload, d.attempts, e.url, e.secret, e.active, d.endpoint_id, e.api_key_id
     FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id=d.endpoint_id
     WHERE d.delivered_at IS NULL AND d.failed_at IS NULL AND d.next_attempt_at <= $1 ${opts.orgId ? "AND d.org_id=$3" : ""}
     ORDER BY d.next_attempt_at LIMIT $2`,
    opts.orgId ? [now, opts.limit ?? 100, opts.orgId] : [now, opts.limit ?? 100],
  );
  let delivered = 0;
  let failed = 0;
  for (const d of due) {
    const payload = typeof d.payload === "string" ? JSON.parse(d.payload) : d.payload;
    const body = JSON.stringify({ id: d.id, ...(payload as object) });
    const attempts = num(d.attempts) + 1;
    let status: number | null = null;
    let error = "";
    try {
      const ts = Math.floor(now.getTime() / 1000);
      const res = await doFetch(d.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "Pilot-Makers-Webhooks/1",
          "pilot-makers-event": d.event,
          "pilot-makers-delivery": d.id,
          "pilot-makers-signature": signature(open(d.secret), ts, body),
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      if (res.status < 200 || res.status >= 300) error = `Réponse HTTP ${res.status}`;
    } catch (e) {
      error = (e as Error).name === "TimeoutError" ? "Délai de réponse dépassé (10 s)" : `Envoi impossible : ${(e as Error).message}`.slice(0, 300);
    }
    if (status === 410) {
      // 410 Gone : l'outil a supprimé son abonnement. Celui d'un outil d'automatisation est retiré, une adresse saisie à la main est suspendue.
      failed++;
      if (d.api_key_id) await db.query("DELETE FROM webhook_endpoints WHERE id=$1", [d.endpoint_id]);
      else {
        await db.query("UPDATE webhook_endpoints SET active=false WHERE id=$1", [d.endpoint_id]);
        await db.query("UPDATE webhook_deliveries SET attempts=$2, last_status=410, last_error=$3, failed_at=$4 WHERE id=$1", [
          d.id,
          attempts,
          "Adresse supprimée par le destinataire (HTTP 410) : envois suspendus",
          now,
        ]);
      }
      continue;
    }
    if (!error) {
      delivered++;
      await db.query("UPDATE webhook_deliveries SET attempts=$2, delivered_at=$3, last_status=$4, last_error='' WHERE id=$1", [
        d.id,
        attempts,
        now,
        status,
      ]);
    } else {
      failed++;
      const giveUp = attempts >= WEBHOOK_MAX_ATTEMPTS;
      await db.query("UPDATE webhook_deliveries SET attempts=$2, last_status=$3, last_error=$4, next_attempt_at=$5, failed_at=$6 WHERE id=$1", [
        d.id,
        attempts,
        status,
        error,
        new Date(now.getTime() + retryDelayMs(attempts)),
        giveUp ? now : null,
      ]);
    }
  }
  return { delivered, failed };
}

/** Événement de test vers une adresse, envoyé immédiatement. */
/** Exemple de contenu pour chaque événement, pour configurer un outil d'automatisation avant le premier envoi réel. */
export const WEBHOOK_SAMPLES: Record<WebhookEvent, Record<string, unknown>> = {
  "quote.accepted": {
    quote_id: "4f1c2b9e-0000-4000-8000-000000000001",
    number: "D-2026-0042",
    version: 1,
    title: "Rénovation de salle de bains",
    customer_id: "4f1c2b9e-0000-4000-8000-000000000002",
    customer_name: "Claire Dubois",
    total_ht_cents: 845000,
    total_ttc_cents: 929500,
    accepted_via: "lien sécurisé",
  },
  "invoice.paid": {
    invoice_id: "4f1c2b9e-0000-4000-8000-000000000003",
    number: "F-2026-0017",
    kind: "final",
    customer_id: "4f1c2b9e-0000-4000-8000-000000000002",
    customer_name: "Claire Dubois",
    total_ttc_cents: 929500,
    amount_due_cents: 929500,
    paid_cents: 929500,
  },
  "customer.created": {
    customer_id: "4f1c2b9e-0000-4000-8000-000000000002",
    type: "particulier",
    name: "Claire Dubois",
    email: "claire.dubois@exemple.fr",
    phone: "0612345678",
    city: "Lyon",
  },
};

export function webhookSamples() {
  return Object.entries(WEBHOOK_SAMPLES).map(([type, data]) => ({
    id: "00000000-0000-4000-8000-000000000000",
    type,
    label: WEBHOOK_EVENTS[type as WebhookEvent],
    created_at: "2026-10-13T08:00:00.000Z",
    data,
  }));
}

export async function sendTestWebhook(ctx: Ctx, endpointId: string, fetchImpl?: Fetch) {
  requireRole(ctx, "admin");
  const n = await enqueueWebhook(ctx.db, ctx.orgId, "ping", { message: "Test de réception depuis Pilot-Makers" }, endpointId);
  if (!n) throw notFound("Adresse introuvable");
  return deliverWebhooks(ctx.db, { orgId: ctx.orgId, fetchImpl, limit: 10 });
}

export interface DeliveryRow {
  id: string;
  event: string;
  url: string;
  attempts: number;
  delivered_at: Date | null;
  failed_at: Date | null;
  last_status: number | null;
  last_error: string;
  created_at: Date;
}

export async function listDeliveries(ctx: Ctx, limit = 20): Promise<DeliveryRow[]> {
  const rows = await ctx.db.query<DeliveryRow>(
    `SELECT d.id, d.event, e.url, d.attempts, d.delivered_at, d.failed_at, d.last_status, d.last_error, d.created_at
     FROM webhook_deliveries d JOIN webhook_endpoints e ON e.id=d.endpoint_id WHERE d.org_id=$1 ORDER BY d.created_at DESC LIMIT $2`,
    [ctx.orgId, limit],
  );
  return rows.map((r) => ({ ...r, attempts: num(r.attempts), last_status: r.last_status === null ? null : num(r.last_status) }));
}

/** Purge des envois de plus de 30 jours (tâche de maintenance). */
export async function purgeWebhookDeliveries(db: Database) {
  const r = await db.query<{ id: string }>("DELETE FROM webhook_deliveries WHERE created_at < now() - interval '30 days' RETURNING id");
  return r.length;
}
