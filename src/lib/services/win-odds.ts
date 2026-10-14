/** Chance de signature d'un devis, calculée sur les devis acceptés, refusés ou expirés de l'entreprise. */

import { num, one } from "@/lib/db";
import { isUuid, notFound } from "@/lib/http";
import { winOdds, type DecidedQuote, type QuoteShape } from "@/lib/win-odds";
import type { Ctx } from "./context";

const SHAPE = `
  SELECT q.id, q.status, q.total_ht_cents, q.issued_at, q.created_at, q.customer_id,
    CASE WHEN c.type = 'particulier' THEN 'particulier' ELSE 'pro' END AS customer_type,
    EXISTS (SELECT 1 FROM quotes p WHERE p.org_id=q.org_id AND p.customer_id=q.customer_id AND p.id<>q.id AND p.status='accepted'
      AND coalesce(p.responded_at, p.updated_at) < coalesce(q.issued_at, now())) AS returning,
    EXISTS (SELECT 1 FROM quote_lines l WHERE l.quote_id=q.id AND l.optional) AS has_options,
    EXISTS (SELECT 1 FROM quote_media m WHERE m.quote_id=q.id) AS has_photos
  FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id`;

const shape = (r: Record<string, unknown>): QuoteShape => ({
  totalCents: num(r.total_ht_cents),
  customerType: r.customer_type === "particulier" ? "particulier" : "pro",
  returning: Boolean(r.returning),
  hasOptions: Boolean(r.has_options),
  hasPhotos: Boolean(r.has_photos),
});

export async function quoteWinOdds(ctx: Ctx, quoteId: string) {
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const q = await one<Record<string, unknown>>(ctx.db, `${SHAPE} WHERE q.id=$1 AND q.org_id=$2`, [quoteId, ctx.orgId]);
  if (!q) throw notFound("Devis introuvable");
  const rows = await ctx.db.query<Record<string, unknown>>(
    `${SHAPE} WHERE q.org_id=$1 AND q.id<>$2 AND q.status IN ('accepted','refused','expired') ORDER BY q.updated_at DESC LIMIT 500`,
    [ctx.orgId, quoteId],
  );
  const history: DecidedQuote[] = rows.map((r) => ({ ...shape(r), won: r.status === "accepted" }));
  return { status: String(q.status), odds: winOdds(shape(q), history), decided: history.length };
}
