/**
 * Abonnements au logiciel (distincts des paiements entre l'artisan et ses clients).
 *
 * Le prestataire de paiement est derrière l'interface BillingProvider. La version
 * fournie ("simulated") reproduit le comportement d'un prestataire réel, y compris
 * des webhooks signés, pour tester tout le parcours sans compte Stripe.
 * Pour brancher Stripe : implémenter BillingProvider et vérifier la signature
 * Stripe dans verifyWebhook.
 */

import type { Database, Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, forbidden, notFound, paymentRequired } from "@/lib/http";
import { activePercent, discounted } from "@/lib/preferential-pricing";
import { hmacSha256, randomToken, safeEqual } from "@/lib/security";
import type { Ctx, Entitlements, PlanInfo } from "./context";
import { audit, requireRole } from "./context";

export const GRACE_DAYS = 7;
const DAY = 86_400_000;

export interface PlanRow {
  code: string;
  name: string;
  description: string;
  price_month_cents: number;
  price_year_cents: number;
  max_users: number;
  max_quotes_per_month: number | null;
  ai_quota_month: number;
  features: PlanInfo["features"];
  trial_days: number;
  active: boolean;
  sort: number;
}

export interface SubscriptionRow {
  id: string;
  org_id: string;
  plan_code: string;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  billing_interval: "month" | "year";
  current_period_start: Date;
  current_period_end: Date | null;
  trial_end: Date | null;
  grace_until: Date | null;
  cancel_at_period_end: boolean;
  provider: string;
  payment_method_label: string | null;
}

function mapPlan(r: Record<string, unknown>): PlanRow {
  return {
    code: String(r.code),
    name: String(r.name),
    description: String(r.description ?? ""),
    price_month_cents: num(r.price_month_cents),
    price_year_cents: num(r.price_year_cents),
    max_users: num(r.max_users),
    max_quotes_per_month: r.max_quotes_per_month === null ? null : num(r.max_quotes_per_month),
    ai_quota_month: num(r.ai_quota_month),
    features: (r.features ?? {}) as PlanInfo["features"],
    trial_days: num(r.trial_days),
    active: Boolean(r.active),
    sort: num(r.sort),
  };
}

export async function listPlans(q: Queryable, onlyActive = true): Promise<PlanRow[]> {
  const rows = await q.query(
    `SELECT * FROM plans ${onlyActive ? "WHERE active" : ""} ORDER BY sort`,
  );
  return rows.map(mapPlan);
}

export async function getPlan(q: Queryable, code: string): Promise<PlanRow | null> {
  const r = await one(q, "SELECT * FROM plans WHERE code = $1", [code]);
  return r ? mapPlan(r) : null;
}

export function toPlanInfo(p: PlanRow): PlanInfo {
  return {
    code: p.code,
    name: p.name,
    maxUsers: p.max_users,
    maxQuotesPerMonth: p.max_quotes_per_month,
    aiQuotaMonth: p.ai_quota_month,
    features: p.features,
  };
}

export async function getSubscription(q: Queryable, orgId: string): Promise<SubscriptionRow | null> {
  return (await one(q, "SELECT * FROM subscriptions WHERE org_id = $1", [orgId])) as SubscriptionRow | null;
}

/**
 * Calcule les droits réellement applicables. Un compte qui ne paie plus garde
 * l'accès à ses données et à l'export : il revient simplement à l'offre Découverte.
 */
export async function computeEntitlements(
  q: Queryable,
  orgId: string,
  orgStatus: string,
  now = new Date(),
): Promise<Entitlements> {
  const sub = await getSubscription(q, orgId);
  const fallback = (await getPlan(q, "decouverte"))!;
  let plan = fallback;
  let notice: string | null = null;
  let status = sub?.status ?? "none";
  if (sub) {
    const subPlan = (await getPlan(q, sub.plan_code)) ?? fallback;
    if (sub.status === "trialing") {
      if (sub.trial_end && sub.trial_end > now) {
        plan = subPlan;
        const days = Math.ceil((sub.trial_end.getTime() - now.getTime()) / DAY);
        notice = `Essai de l'offre ${subPlan.name} : ${days} jour(s) restant(s)`;
      } else {
        status = "expired";
        notice = "Votre essai est terminé : offre Découverte appliquée. Vos données restent accessibles.";
      }
    } else if (sub.status === "active") {
      plan = subPlan;
      if (sub.cancel_at_period_end && sub.current_period_end) {
        notice = `Abonnement résilié : actif jusqu'au ${sub.current_period_end.toLocaleDateString("fr-FR")}`;
      }
    } else if (sub.status === "past_due") {
      if (sub.grace_until && sub.grace_until > now) {
        plan = subPlan;
        notice = "Paiement en échec : mettez à jour votre moyen de paiement avant la fin de la période de grâce.";
      } else {
        notice = "Paiement en échec : offre Découverte appliquée. Vos données restent accessibles et exportables.";
      }
    } else {
      notice = "Abonnement terminé : offre Découverte appliquée. Vos données restent accessibles et exportables.";
    }
  }
  const readOnly = orgStatus === "suspended";
  if (readOnly) notice = "Compte suspendu : lecture et export uniquement. Contactez l'assistance.";
  return { plan: toPlanInfo(plan), subscriptionStatus: status, readOnly, notice };
}

export async function createInitialSubscription(q: Queryable, orgId: string, now = new Date()) {
  const pro = await getPlan(q, "professionnel");
  const trialDays = pro?.trial_days ?? 14;
  await q.query(
    `INSERT INTO subscriptions (org_id, plan_code, status, trial_end, current_period_start, current_period_end)
     VALUES ($1, 'professionnel', 'trialing', $2, $3, $2)`,
    [orgId, new Date(now.getTime() + trialDays * DAY), now],
  );
}

/** Nombre de devis émis (première version) depuis le début du mois. */
export async function quotesIssuedThisMonth(q: Queryable, orgId: string, now = new Date()): Promise<number> {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const r = await one<{ n: unknown }>(
    q,
    "SELECT count(*) AS n FROM quote_versions WHERE org_id = $1 AND version = 1 AND issued_at >= $2",
    [orgId, start],
  );
  return num(r?.n);
}

export async function assertCanIssue(q: Queryable, ctx: Ctx) {
  const max = ctx.entitlements.plan.maxQuotesPerMonth;
  if (max !== null && (await quotesIssuedThisMonth(q, ctx.orgId)) >= max) {
    throw paymentRequired(`Limite de ${max} devis émis par mois atteinte pour l'offre ${ctx.entitlements.plan.name}`);
  }
}

export async function assertAiQuota(q: Queryable, ctx: Ctx) {
  const quota = ctx.entitlements.plan.aiQuotaMonth;
  if (quota <= 0) throw paymentRequired("L'assistant de préparation n'est pas inclus dans votre offre");
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const r = await one<{ n: unknown }>(
    q,
    "SELECT coalesce(sum(units),0) AS n FROM usage_events WHERE org_id = $1 AND kind = 'ai' AND created_at >= $2",
    [ctx.orgId, start],
  );
  if (num(r?.n) >= quota) throw paymentRequired(`Quota mensuel de l'assistant atteint (${quota} demandes)`);
}

export async function assertCanAddMember(q: Queryable, ctx: Ctx) {
  const r = await one<{ n: unknown }>(q, "SELECT count(*) AS n FROM memberships WHERE org_id = $1 AND job_function IS DISTINCT FROM 'comptable'", [
    ctx.orgId,
  ]);
  if (num(r?.n) >= ctx.entitlements.plan.maxUsers) {
    throw paymentRequired(`L'offre ${ctx.entitlements.plan.name} est limitée à ${ctx.entitlements.plan.maxUsers} utilisateur(s)`);
  }
}

/* ------------------------------------------------------------------ */
/* Prestataire de paiement                                             */
/* ------------------------------------------------------------------ */

export interface BillingProvider {
  name: string;
  /** Démarre un paiement ; renvoie l'événement que le prestataire enverra par webhook. */
  checkout(input: { orgId: string; planCode: string; interval: "month" | "year"; card: string }): Promise<WebhookEvent>;
}

export interface WebhookEvent {
  id: string;
  type:
    | "subscription.activated"
    | "invoice.paid"
    | "invoice.payment_failed"
    | "subscription.canceled"
    | "charge.refunded";
  data: {
    orgId: string;
    planCode?: string;
    interval?: "month" | "year";
    amountCents?: number;
    paymentMethodLabel?: string;
    invoiceNumber?: string;
  };
}

/** Simulateur : la carte 4000 0000 0000 0002 est refusée, comme chez les prestataires réels. */
export const simulatedProvider: BillingProvider = {
  name: "simulated",
  async checkout({ orgId, planCode, interval, card }) {
    const digits = card.replace(/\D/g, "");
    if (digits.length < 12) throw badRequest("Numéro de carte invalide");
    const declined = digits === "4000000000000002";
    return {
      id: "evt_" + randomToken(12),
      type: declined ? "invoice.payment_failed" : "subscription.activated",
      data: { orgId, planCode, interval, paymentMethodLabel: `Carte se terminant par ${digits.slice(-4)}` },
    };
  },
};

export function signWebhook(payload: string, secret = process.env.BILLING_WEBHOOK_SECRET ?? "") {
  const ts = Math.floor(Date.now() / 1000);
  return `t=${ts},v1=${hmacSha256(secret, `${ts}.${payload}`)}`;
}

/** Vérifie la signature et la fraîcheur (5 minutes) d'un webhook. */
export function verifyWebhook(payload: string, header: string | null, secret = process.env.BILLING_WEBHOOK_SECRET ?? "") {
  if (!secret) throw forbidden("Secret de webhook non configuré");
  if (!header) throw forbidden("Signature absente");
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const ts = Number(parts.t);
  if (!parts.v1 || !Number.isFinite(ts)) throw forbidden("Signature mal formée");
  if (Math.abs(Date.now() / 1000 - ts) > 300) throw forbidden("Signature expirée");
  if (!safeEqual(parts.v1, hmacSha256(secret, `${ts}.${payload}`))) throw forbidden("Signature invalide");
}

async function nextInvoiceNumber(q: Queryable): Promise<string> {
  const r = await one<{ n: unknown }>(q, "SELECT count(*) AS n FROM billing_invoices");
  return `PM-${new Date().getFullYear()}-${String(num(r?.n) + 1).padStart(6, "0")}`;
}

/** Traite un webhook de façon idempotente : un même événement n'est appliqué qu'une fois. */
export async function handleWebhookEvent(db: Database, provider: string, event: WebhookEvent, now = new Date()) {
  return db.transaction(async (tx) => {
    const inserted = await tx.query(
      `INSERT INTO billing_events (provider, provider_event_id, type, org_id, payload)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (provider, provider_event_id) DO NOTHING RETURNING id`,
      [provider, event.id, event.type, event.data.orgId, JSON.stringify(event)],
    );
    if (inserted.length === 0) return { duplicate: true };
    const sub = await getSubscription(tx, event.data.orgId);
    if (!sub) throw notFound("Abonnement introuvable");
    const plan = (await getPlan(tx, event.data.planCode ?? sub.plan_code)) ?? (await getPlan(tx, sub.plan_code))!;
    const interval = event.data.interval ?? sub.billing_interval;
    const periodEnd = new Date(now.getTime() + (interval === "year" ? 365 : 30) * DAY);
    switch (event.type) {
      case "subscription.activated":
      case "invoice.paid": {
        await tx.query(
          `UPDATE subscriptions SET plan_code=$2, status='active', billing_interval=$3, current_period_start=$4,
             current_period_end=$5, grace_until=NULL, trial_end=NULL, cancel_at_period_end=false,
             payment_method_label=coalesce($6, payment_method_label), provider=$7, updated_at=now()
           WHERE org_id=$1`,
          [event.data.orgId, plan.code, interval, now, periodEnd, event.data.paymentMethodLabel ?? null, provider],
        );
        const benefit = await one<{ status: string; percent: unknown; valid_until: unknown }>(
          tx,
          "SELECT status, percent, valid_until::text AS valid_until FROM pricing_benefits WHERE org_id=$1",
          [event.data.orgId],
        );
        const percent = activePercent(
          benefit ? { status: benefit.status, percent: num(benefit.percent), validUntil: benefit.valid_until ? String(benefit.valid_until) : null } : null,
          now.toISOString().slice(0, 10),
        );
        const ht = discounted(interval === "year" ? plan.price_year_cents : plan.price_month_cents, percent);
        if (ht > 0) {
          await tx.query(
            `INSERT INTO billing_invoices (org_id, number, plan_code, amount_ht_cents, amount_ttc_cents, status, period_start, period_end)
             VALUES ($1,$2,$3,$4,$5,'paid',$6,$7)`,
            [event.data.orgId, await nextInvoiceNumber(tx), plan.code, ht, Math.round((ht * 12) / 10), now, periodEnd],
          );
        }
        break;
      }
      case "invoice.payment_failed":
        await tx.query(
          `UPDATE subscriptions SET status = CASE WHEN status = 'trialing' THEN status ELSE 'past_due' END,
             grace_until = CASE WHEN status = 'trialing' THEN grace_until ELSE coalesce(grace_until, $2) END, updated_at=now()
           WHERE org_id=$1`,
          [event.data.orgId, new Date(now.getTime() + GRACE_DAYS * DAY)],
        );
        break;
      case "subscription.canceled":
        await tx.query("UPDATE subscriptions SET status='canceled', updated_at=now() WHERE org_id=$1", [event.data.orgId]);
        break;
      case "charge.refunded":
        if (event.data.invoiceNumber) {
          await tx.query("UPDATE billing_invoices SET status='refunded' WHERE number=$1 AND org_id=$2", [
            event.data.invoiceNumber,
            event.data.orgId,
          ]);
        }
        break;
    }
    await audit(tx, { orgId: event.data.orgId, action: "billing." + event.type, target: event.id });
    return { duplicate: false };
  });
}

export async function startCheckout(ctx: Ctx, planCode: string, interval: "month" | "year", card: string) {
  requireRole(ctx, "owner");
  const plan = await getPlan(ctx.db, planCode);
  if (!plan || !plan.active) throw badRequest("Offre inconnue");
  if (plan.price_month_cents === 0) {
    await ctx.db.query(
      "UPDATE subscriptions SET plan_code='decouverte', status='active', current_period_end=NULL, trial_end=NULL, updated_at=now() WHERE org_id=$1",
      [ctx.orgId],
    );
    return { ok: true };
  }
  const event = await simulatedProvider.checkout({ orgId: ctx.orgId, planCode, interval, card });
  // Le simulateur appelle notre webhook comme le ferait le prestataire réel.
  await handleWebhookEvent(ctx.db, simulatedProvider.name, event);
  return { ok: event.type !== "invoice.payment_failed" };
}

export async function cancelAtPeriodEnd(ctx: Ctx, cancel: boolean) {
  requireRole(ctx, "owner");
  await ctx.db.query("UPDATE subscriptions SET cancel_at_period_end=$2, updated_at=now() WHERE org_id=$1", [ctx.orgId, cancel]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: cancel ? "billing.cancel" : "billing.resume" });
}

/** Tâche périodique : fin de période, renouvellement simulé, fin de grâce. */
export async function runBillingMaintenance(db: Database, now = new Date()) {
  const due = await db.query<{ org_id: string; cancel_at_period_end: boolean; plan_code: string; billing_interval: "month" | "year" }>(
    "SELECT org_id, cancel_at_period_end, plan_code, billing_interval FROM subscriptions WHERE status='active' AND current_period_end IS NOT NULL AND current_period_end < $1",
    [now],
  );
  for (const s of due) {
    if (s.cancel_at_period_end) {
      await handleWebhookEvent(db, "simulated", { id: "evt_" + randomToken(12), type: "subscription.canceled", data: { orgId: s.org_id } }, now);
    } else {
      await handleWebhookEvent(
        db,
        "simulated",
        { id: "evt_" + randomToken(12), type: "invoice.paid", data: { orgId: s.org_id, planCode: s.plan_code, interval: s.billing_interval } },
        now,
      );
    }
  }
  return { processed: due.length };
}
