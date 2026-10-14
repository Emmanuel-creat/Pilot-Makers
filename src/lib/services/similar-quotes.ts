/**
 * Devis similaires gagnés ou perdus : les plus proches du devis ouvert, et ses prix unitaires comparés à ceux
 * qui ont été acceptés ou refusés.
 */

import { parseScaled } from "@/lib/calc/decimal";
import { num, one } from "@/lib/db";
import { isUuid, notFound } from "@/lib/http";
import { comparePrices, signature, similarity, type PricedLine } from "@/lib/similar-quotes";
import type { Ctx } from "./context";

/** Ressemblance minimale pour qu'un devis soit retenu. */
export const MIN_SIMILARITY = 0.25;

const cents = (text: string) => {
  try {
    return Number(parseScaled(text.replace(/[\s€]/g, "") || "0", 2));
  } catch {
    return 0;
  }
};

const milli = (text: string) => {
  try {
    return Number(parseScaled(text.replace(/\s/g, "") || "0", 3));
  } catch {
    return 0;
  }
};

type LineRow = { quote_id: string; label: string; unit: string; quantity: string; unit_price: string };

async function linesOf(ctx: Ctx, ids: string[]) {
  const rows = ids.length
    ? await ctx.db.query<LineRow>(
        "SELECT quote_id, label, unit, quantity, unit_price FROM quote_lines WHERE org_id=$1 AND kind='item' AND quote_id = ANY($2::uuid[]) ORDER BY position",
        [ctx.orgId, ids],
      )
    : [];
  const by = new Map<string, PricedLine[]>();
  const totals = new Map<string, number>();
  for (const r of rows) {
    const price = cents(r.unit_price);
    by.set(r.quote_id, [...(by.get(r.quote_id) ?? []), { label: r.label, unit: r.unit, unitPriceCents: price }]);
    totals.set(r.quote_id, (totals.get(r.quote_id) ?? 0) + Math.round((milli(r.quantity) * price) / 1000));
  }
  return { by, totals };
}

export async function similarQuotes(ctx: Ctx, quoteId: string, limit = 5) {
  if (!isUuid(quoteId)) throw notFound("Devis introuvable");
  const q = await one<{ title: string; total_ht_cents: unknown }>(ctx.db, "SELECT title, total_ht_cents FROM quotes WHERE id=$1 AND org_id=$2", [
    quoteId,
    ctx.orgId,
  ]);
  if (!q) throw notFound("Devis introuvable");
  const candidates = await ctx.db.query<{
    id: string;
    number: string | null;
    title: string;
    status: string;
    refusal_reason: string;
    total_ht_cents: unknown;
    decided_at: unknown;
    customer: string | null;
  }>(
    `SELECT q.id, q.number, q.title, q.status, q.refusal_reason, q.total_ht_cents, q.updated_at AS decided_at,
       coalesce(nullif(c.company_name, ''), trim(c.first_name || ' ' || c.last_name)) AS customer
     FROM quotes q LEFT JOIN customers c ON c.id=q.customer_id
     WHERE q.org_id=$1 AND q.id<>$2 AND q.status IN ('accepted', 'refused', 'expired')
     ORDER BY q.updated_at DESC LIMIT 400`,
    [ctx.orgId, quoteId],
  );
  const { by, totals } = await linesOf(ctx, [quoteId, ...candidates.map((c) => c.id)]);
  const mine = by.get(quoteId) ?? [];
  const current = { title: q.title, labels: mine.map((l) => l.label), totalCents: num(q.total_ht_cents) || (totals.get(quoteId) ?? 0) };
  const sig = signature(current);
  const scored = candidates
    .map((c) => {
      const lines = by.get(c.id) ?? [];
      const shape = { title: c.title, labels: lines.map((l) => l.label), totalCents: num(c.total_ht_cents) || (totals.get(c.id) ?? 0) };
      return { c, lines, totalCents: shape.totalCents, score: similarity(current, shape, sig, signature(shape)) };
    })
    .filter((x) => x.score >= MIN_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);
  const won = scored.filter((x) => x.c.status === "accepted");
  const lost = scored.filter((x) => x.c.status !== "accepted");
  return {
    quotes: scored.slice(0, limit).map((x) => ({
      id: x.c.id,
      number: x.c.number ?? "",
      title: x.c.title,
      customer: x.c.customer ?? "",
      totalCents: x.totalCents,
      won: x.c.status === "accepted",
      status: x.c.status,
      reason: x.c.refusal_reason,
      similarity: x.score,
    })),
    won: won.length,
    lost: lost.length,
    prices: comparePrices(
      mine,
      won.flatMap((x) => x.lines),
      lost.flatMap((x) => x.lines),
    ),
  };
}
