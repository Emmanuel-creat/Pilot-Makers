/** Engagements vérifiés : mesure sur les documents de l'entreprise, choix des engagements publiés sur la vitrine. */

import type { Queryable } from "@/lib/db";
import { badRequest } from "@/lib/http";
import {
  COMMITMENT_KEYS,
  type CommitmentCase,
  type CommitmentKey,
  depositKept,
  detailKept,
  measure,
  priceKept,
  quickKept,
  readCommitments,
} from "@/lib/commitments";
import { audit, requirePermission, requireWritable, type Ctx } from "./context";

const YEAR = "interval '365 days'";

export async function commitmentCases(db: Queryable, orgId: string, now = new Date()): Promise<Record<CommitmentKey, CommitmentCase[]>> {
  const since = now.toISOString();
  const quotes = await db.query<{ id: string; number: string; deposit_percent: string }>(
    `SELECT id, number, deposit_percent FROM quotes
     WHERE org_id=$1 AND issued_at IS NOT NULL AND amends_quote_id IS NULL AND issued_at > $2::timestamptz - ${YEAR} ORDER BY issued_at`,
    [orgId, since],
  );
  const lines = await db.query<{ quote_id: string; kind: string; quantity: string; unit_price: string }>(
    `SELECT l.quote_id, l.kind, l.quantity, l.unit_price FROM quote_lines l JOIN quotes q ON q.id=l.quote_id
     WHERE q.org_id=$1 AND q.issued_at IS NOT NULL AND q.amends_quote_id IS NULL AND q.issued_at > $2::timestamptz - ${YEAR}`,
    [orgId, since],
  );
  const prices = await db.query<{ number: string; quoted: unknown; amendments: unknown; invoiced: unknown }>(
    `SELECT q.number,
            (SELECT v.total_ht_cents FROM quote_versions v WHERE v.quote_id=q.id AND v.version=q.accepted_version) AS quoted,
            (SELECT coalesce(sum(a.total_ht_cents),0) FROM quotes a WHERE a.amends_quote_id=q.id AND a.accepted_version IS NOT NULL) AS amendments,
            (SELECT i.total_ht_cents FROM invoices i WHERE i.quote_id=q.id AND i.kind='final' ORDER BY i.issued_at DESC LIMIT 1) AS invoiced
     FROM quotes q
     WHERE q.org_id=$1 AND q.accepted_version IS NOT NULL AND q.amends_quote_id IS NULL
       AND EXISTS (SELECT 1 FROM invoices i WHERE i.quote_id=q.id AND i.kind='final' AND i.issued_at > $2::timestamptz - ${YEAR})`,
    [orgId, since],
  );
  const leads = await db.query<{ number: string; created_at: Date; issued_at: Date }>(
    `SELECT q.number, l.created_at, q.issued_at FROM leads l JOIN quotes q ON q.id=l.quote_id
     WHERE l.org_id=$1 AND q.issued_at IS NOT NULL AND q.issued_at > $2::timestamptz - ${YEAR}`,
    [orgId, since],
  );
  return {
    acompte: quotes.map((q) => ({ ref: q.number, kept: depositKept(q.deposit_percent) })),
    detail: quotes.map((q) => ({
      ref: q.number,
      kept: detailKept(lines.filter((l) => l.quote_id === q.id).map((l) => ({ kind: l.kind, quantity: l.quantity, unitPrice: l.unit_price }))),
    })),
    prix: prices
      .filter((p) => p.quoted != null && p.invoiced != null)
      .map((p) => ({ ref: p.number, kept: priceKept(Number(p.quoted), Number(p.amendments), Number(p.invoiced)) })),
    rapidite: leads.map((l) => ({ ref: l.number, kept: quickKept(new Date(l.created_at), new Date(l.issued_at)) })),
  };
}

/** Tous les engagements mesurés, avec ceux que l'entreprise a choisi de publier */
export async function myCommitments(ctx: Ctx, now = new Date()) {
  const cases = await commitmentCases(ctx.db, ctx.orgId, now);
  const r = await ctx.db.query<{ commitments: unknown }>("SELECT commitments FROM showcases WHERE org_id=$1", [ctx.orgId]);
  return {
    hasShowcase: r.length > 0,
    chosen: readCommitments(r[0]?.commitments),
    measures: COMMITMENT_KEYS.map((k) => measure(k, cases[k])),
  };
}

export async function setCommitments(ctx: Ctx, keys: string[]) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const chosen = readCommitments(keys);
  const r = await ctx.db.query("UPDATE showcases SET commitments=$2::jsonb, updated_at=now() WHERE org_id=$1 RETURNING org_id", [
    ctx.orgId,
    JSON.stringify(chosen),
  ]);
  if (!r.length) throw badRequest("Créez d'abord votre vitrine dans Entreprise");
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "commitments.set", data: { chosen } });
  return chosen;
}

/** Engagements publiés sur la vitrine, avec le taux réellement mesuré (sans les numéros de devis) */
export async function publicCommitments(db: Queryable, orgId: string, raw: unknown, now = new Date()) {
  const chosen = readCommitments(raw);
  if (!chosen.length) return [];
  const cases = await commitmentCases(db, orgId, now);
  return chosen.map((k) => {
    const m = measure(k, cases[k]);
    return { ...m, missed: [] as string[] };
  });
}
