/** Demandes de tarif préférentiel (apprentis, créateurs) et leur application à l'abonnement. */

import type { Queryable } from "@/lib/db";
import { num, one } from "@/lib/db";
import { badRequest, notFound } from "@/lib/http";
import { activePercent, benefitRequestSchema, eligibility, type BenefitKind, type BenefitRequest } from "@/lib/preferential-pricing";
import { requirePlatformAdmin } from "./admin";
import type { Ctx } from "./context";
import { audit, requireRole } from "./context";

export interface PricingBenefit {
  id: string;
  kind: BenefitKind;
  status: "en_attente" | "accorde" | "refuse";
  details: BenefitRequest;
  percent: number;
  validUntil: string | null;
  requestedAt: Date;
  decisionNote: string;
}

const today = (now = new Date()) => now.toISOString().slice(0, 10);
const isoOf = (v: unknown) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);

function map(r: Record<string, unknown>): PricingBenefit {
  return {
    id: String(r.id),
    kind: r.kind as BenefitKind,
    status: r.status as PricingBenefit["status"],
    details: r.details as BenefitRequest,
    percent: num(r.percent),
    validUntil: isoOf(r.valid_until),
    requestedAt: r.requested_at as Date,
    decisionNote: String(r.decision_note ?? ""),
  };
}

export async function getBenefit(q: Queryable, orgId: string): Promise<PricingBenefit | null> {
  const r = await one(q, "SELECT * FROM pricing_benefits WHERE org_id=$1", [orgId]);
  return r ? map(r) : null;
}

/** Remise en pourcentage appliquée aujourd'hui à l'abonnement de l'entreprise. */
export async function benefitPercent(q: Queryable, orgId: string, now = new Date()): Promise<number> {
  const b = await getBenefit(q, orgId);
  return activePercent(b, today(now));
}

/** Dépose (ou remplace) la demande de l'entreprise ; seul le propriétaire peut le faire. */
export async function requestBenefit(ctx: Ctx, raw: unknown, now = new Date()) {
  requireRole(ctx, "owner");
  const parsed = benefitRequestSchema.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message);
  const check = eligibility(parsed.data, today(now));
  if (!check.ok) throw badRequest(check.reason);
  if (parsed.data.kind === "createur") {
    const org = await one<{ siren: string }>(ctx.db, "SELECT siren FROM organizations WHERE id=$1", [ctx.orgId]);
    if (!org?.siren.trim()) throw badRequest("Renseignez le SIREN de l'entreprise dans le profil : il sert à vérifier la date de création");
  }
  const current = await getBenefit(ctx.db, ctx.orgId);
  if (current && activePercent(current, today(now)) > 0) throw badRequest("Un tarif préférentiel est déjà appliqué à votre abonnement");
  await ctx.db.query(
    `INSERT INTO pricing_benefits (org_id, kind, status, details, requested_by, requested_at)
     VALUES ($1,$2,'en_attente',$3,$4,$5)
     ON CONFLICT (org_id) DO UPDATE SET kind=EXCLUDED.kind, status='en_attente', details=EXCLUDED.details, percent=0, valid_until=NULL,
       requested_by=EXCLUDED.requested_by, requested_at=EXCLUDED.requested_at, decided_at=NULL, decision_note=''`,
    [ctx.orgId, parsed.data.kind, JSON.stringify(parsed.data), ctx.userId, now],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "billing.benefit_request", target: parsed.data.kind });
}

/** Demandes en attente, pour l'administration de la plateforme. */
export async function pendingBenefits(ctx: Ctx) {
  requirePlatformAdmin(ctx);
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT b.*, coalesce(nullif(o.trade_name,''), o.legal_name) AS org_name, o.siren
       FROM pricing_benefits b JOIN organizations o ON o.id = b.org_id
      WHERE b.status='en_attente' ORDER BY b.requested_at`,
  );
  return rows.map((r) => ({ ...map(r), orgName: String(r.org_name ?? ""), siren: String(r.siren ?? "") }));
}

/**
 * Décision après vérification du justificatif. À l'accord, l'éligibilité est
 * recalculée à la date du jour : la durée court à partir de l'accord.
 */
export async function decideBenefit(ctx: Ctx, id: string, accept: boolean, note: string, now = new Date()) {
  requirePlatformAdmin(ctx);
  const r = await one(ctx.db, "SELECT * FROM pricing_benefits WHERE id=$1", [id]);
  if (!r) throw notFound("Demande introuvable");
  const b = map(r);
  if (b.status !== "en_attente") throw badRequest("Cette demande a déjà été traitée");
  if (!accept && !note.trim()) throw badRequest("Indiquez le motif du refus");
  if (accept) {
    const check = eligibility(b.details, today(now));
    if (!check.ok) throw badRequest(check.reason);
    await ctx.db.query("UPDATE pricing_benefits SET status='accorde', percent=$2, valid_until=$3, decided_at=$4, decision_note=$5 WHERE id=$1", [
      id,
      check.percent,
      check.validUntil,
      now,
      note.trim(),
    ]);
  } else {
    await ctx.db.query("UPDATE pricing_benefits SET status='refuse', decided_at=$2, decision_note=$3 WHERE id=$1", [id, now, note.trim()]);
  }
  await audit(ctx.db, { orgId: String(r.org_id), userId: ctx.userId, action: accept ? "admin.benefit_grant" : "admin.benefit_refuse", target: id, ip: ctx.ip });
}
