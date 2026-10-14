/**
 * Repères anonymes : seules les entreprises volontaires y contribuent, et seules des fourchettes
 * calculées sur au moins MIN_ORGS autres entreprises sont restituées, jamais une valeur individuelle.
 */

import { num, one } from "@/lib/db";
import { band, itemKey, MIN_ORGS, peerGroup, position, regionOf, sizeBand, type Band, type OrgProfile, type Position } from "@/lib/benchmark";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";

export async function setBenchmarkOptin(ctx: Ctx, on: boolean) {
  requireWritable(ctx);
  requirePermission(ctx, "settings");
  await ctx.db.query(`UPDATE organizations SET benchmark_optin_at=${on ? "coalesce(benchmark_optin_at, now())" : "NULL"} WHERE id=$1`, [ctx.orgId]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: on ? "benchmark.optin" : "benchmark.optout", ip: ctx.ip });
}

export interface PriceLine {
  id: string;
  name: string;
  unit: string;
  priceCents: number;
  band: Band | null;
  scope: "region" | "france" | null;
  position: Position | null;
}

const centsBand = (b: Band): Band => ({ ...b, low: Math.round(b.low), median: Math.round(b.median), high: Math.round(b.high) });

/** Fourchette de prix des autres entreprises de la région (sinon de France) pour chaque article comparable. */
async function priceIndex(ctx: Ctx, region: string): Promise<PriceLine[]> {
  const mine = await ctx.db.query<{ id: string; name: string; unit: string; ean: string; source: string; unit_price4: unknown }>(
    `SELECT id, name, unit, ean, source, unit_price4 FROM catalog_items
     WHERE org_id=$1 AND active AND unit_price4 > 0 AND (ean <> '' OR source='library') ORDER BY usage_count DESC, lower(name) LIMIT 200`,
    [ctx.orgId],
  );
  const keyed = mine.map((m) => ({ ...m, key: itemKey(m) })).filter((m) => m.key);
  if (!keyed.length) return [];
  const others = await ctx.db.query<{ org_id: string; postal_code: string; name: string; unit: string; ean: string; source: string; price4: unknown }>(
    `SELECT i.org_id, o.postal_code, i.name, i.unit, i.ean, i.source, avg(i.unit_price4) AS price4
     FROM catalog_items i JOIN organizations o ON o.id=i.org_id
     WHERE o.benchmark_optin_at IS NOT NULL AND i.org_id <> $1 AND i.active AND i.unit_price4 > 0 AND (i.ean <> '' OR i.source='library')
     GROUP BY i.org_id, o.postal_code, i.name, i.unit, i.ean, i.source`,
    [ctx.orgId],
  );
  const byKey = new Map<string, Map<string, { region: string; prices: number[] }>>();
  for (const o of others) {
    const k = itemKey(o);
    if (!k) continue;
    const orgs = byKey.get(k) ?? new Map();
    const e = orgs.get(o.org_id) ?? { region: regionOf(o.postal_code), prices: [] };
    e.prices.push(num(o.price4) / 100);
    orgs.set(o.org_id, e);
    byKey.set(k, orgs);
  }
  return keyed.map((m) => {
    const orgs = [...(byKey.get(m.key!)?.values() ?? [])].map((e) => ({ region: e.region, price: e.prices.reduce((s, p) => s + p, 0) / e.prices.length }));
    const local = region ? band(orgs.filter((o) => o.region === region).map((o) => o.price)) : null;
    const national = local ? null : band(orgs.map((o) => o.price));
    const b = local ?? national;
    const priceCents = Math.round(num(m.unit_price4) / 100);
    return {
      id: m.id,
      name: m.name,
      unit: m.unit,
      priceCents,
      band: b ? centsBand(b) : null,
      scope: local ? "region" : national ? "france" : null,
      position: b ? position(priceCents, b) : null,
    };
  });
}

export const METRICS = {
  acceptance: { label: "Devis acceptés", unit: "%", better: "high" },
  averageQuote: { label: "Montant moyen d'un devis accepté", unit: "€ HT", better: null },
  paymentDays: { label: "Délai moyen de paiement des factures", unit: "jours", better: "low" },
} as const;
export type Metric = keyof typeof METRICS;

interface OrgMetrics extends OrgProfile {
  acceptance: number;
  averageQuote: number;
  paymentDays: number;
}

async function orgMetrics(ctx: Ctx, since: string): Promise<OrgMetrics[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT o.id, o.trade, o.postal_code,
       (SELECT count(*) FROM memberships m WHERE m.org_id=o.id) AS people,
       (SELECT count(*) FILTER (WHERE q.status='accepted') FROM quotes q WHERE q.org_id=o.id AND q.issued_at >= $1 AND q.status IN ('accepted','refused','expired')) AS won,
       (SELECT count(*) FROM quotes q WHERE q.org_id=o.id AND q.issued_at >= $1 AND q.status IN ('accepted','refused','expired')) AS decided,
       (SELECT avg(q.total_ht_cents) FROM quotes q WHERE q.org_id=o.id AND q.status='accepted' AND q.responded_at >= $1) AS avg_quote,
       (SELECT avg(d) FROM (SELECT max(p.paid_on) - i.issue_date AS d FROM invoices i
          JOIN invoice_payments p ON p.invoice_id=i.id AND p.canceled_at IS NULL
          WHERE i.org_id=o.id AND i.kind <> 'credit_note' AND i.issue_date >= $1
          GROUP BY i.id, i.issue_date, i.total_ttc_cents HAVING sum(p.amount_cents) >= i.total_ttc_cents) x) AS pay_days
     FROM organizations o WHERE o.benchmark_optin_at IS NOT NULL OR o.id=$2`,
    [since, ctx.orgId],
  );
  return rows.map((r) => {
    const decided = Number(r.decided);
    return {
      id: String(r.id),
      trade: String(r.trade ?? ""),
      region: regionOf(String(r.postal_code ?? "")),
      size: sizeBand(Number(r.people)),
      acceptance: decided >= 3 ? (Number(r.won) / decided) * 100 : NaN,
      averageQuote: r.avg_quote == null ? NaN : Number(r.avg_quote) / 100,
      paymentDays: r.pay_days == null ? NaN : Number(r.pay_days),
    };
  });
}

export async function benchmarkBoard(ctx: Ctx, now = new Date()) {
  const org = await one<{ benchmark_optin_at: Date | null; postal_code: string; trade: string }>(
    ctx.db,
    "SELECT benchmark_optin_at, postal_code, trade FROM organizations WHERE id=$1",
    [ctx.orgId],
  );
  const optedIn = !!org?.benchmark_optin_at;
  const region = regionOf(org?.postal_code ?? "");
  const participants = Number((await one<{ n: unknown }>(ctx.db, "SELECT count(*) AS n FROM organizations WHERE benchmark_optin_at IS NOT NULL", []))?.n ?? 0);
  if (!optedIn) return { optedIn, region, trade: org?.trade ?? "", participants, prices: [], peers: null, minOrgs: MIN_ORGS };
  const since = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const [prices, all] = await Promise.all([priceIndex(ctx, region), orgMetrics(ctx, since)]);
  const me = all.find((o) => o.id === ctx.orgId)!;
  const others = all.filter((o) => o.id !== ctx.orgId);
  const group = peerGroup(me, others.length ? [me, ...others] : [me]);
  const peers = others.filter((o) => group.ids.includes(o.id));
  const metrics = (Object.keys(METRICS) as Metric[]).map((k) => {
    const b = band(peers.map((p) => p[k]));
    const mine = me[k];
    return { key: k, ...METRICS[k], mine: Number.isFinite(mine) ? mine : null, band: b, position: b && Number.isFinite(mine) ? position(mine, b) : null };
  });
  return { optedIn, region, trade: org?.trade ?? "", participants, prices, peers: { label: group.label, count: peers.length, metrics }, minOrgs: MIN_ORGS };
}
