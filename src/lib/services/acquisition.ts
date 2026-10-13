/** Origine des clients et coût d'acquisition par source de demandes. */

import { num } from "@/lib/db";
import { badRequest } from "@/lib/http";
import { metrics, type SourceMetrics } from "@/lib/acquisition";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";
import { LEAD_SOURCES } from "./leads-labels";
import { eurosToCents } from "./pricing";

export type Source = keyof typeof LEAD_SOURCES;
export const SOURCES = Object.keys(LEAD_SOURCES) as Source[];
/** Clients sans demande enregistrée : leur origine n'est pas connue. */
export const UNKNOWN = "inconnue";

export interface AcquisitionRow extends SourceMetrics {
  source: Source | typeof UNKNOWN;
  label: string;
}

export async function getAcquisitionCosts(ctx: Ctx, year: number): Promise<Partial<Record<Source, number>>> {
  requirePermission(ctx, "billing");
  const rows = await ctx.db.query<{ source: string; cents: unknown }>("SELECT source, cents FROM org_acquisition_costs WHERE org_id=$1 AND year=$2", [
    ctx.orgId,
    year,
  ]);
  const out: Partial<Record<Source, number>> = {};
  for (const r of rows) if (r.source in LEAD_SOURCES) out[r.source as Source] = num(r.cents);
  return out;
}

export async function saveAcquisitionCosts(ctx: Ctx, year: number, input: Partial<Record<Source, string>>) {
  requirePermission(ctx, "billing");
  requireWritable(ctx);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw badRequest("Année invalide");
  const values: [Source, number][] = [];
  for (const k of SOURCES) {
    const v = String(input[k] ?? "").trim();
    if (!v) continue;
    let cents: number;
    try {
      cents = eurosToCents(v, LEAD_SOURCES[k]);
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    if (cents < 0) throw badRequest(`${LEAD_SOURCES[k]} : montant positif attendu`);
    values.push([k, cents]);
  }
  await ctx.db.transaction(async (tx) => {
    await tx.query("DELETE FROM org_acquisition_costs WHERE org_id=$1 AND year=$2", [ctx.orgId, year]);
    for (const [source, cents] of values) {
      await tx.query("INSERT INTO org_acquisition_costs (org_id, year, source, cents) VALUES ($1,$2,$3,$4)", [ctx.orgId, year, source, cents]);
    }
  });
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "organization.acquisition_costs",
    data: { year, ...Object.fromEntries(values) },
    ip: ctx.ip,
  });
}

/**
 * Par source : demandes reçues et gagnées dans l'année, chiffre d'affaires HT facturé dans l'année aux
 * clients venus par cette source (source de leur première demande), dépenses saisies.
 */
export async function acquisition(ctx: Ctx, year: number): Promise<AcquisitionRow[]> {
  requirePermission(ctx, "billing");
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const [leads, revenue, costs] = await Promise.all([
    ctx.db.query<{ source: string; leads: unknown; won: unknown }>(
      `SELECT l.source, count(*) AS leads,
         count(*) FILTER (WHERE l.status='gagnee' OR q.status='accepted') AS won
       FROM leads l LEFT JOIN quotes q ON q.id=l.quote_id
       WHERE l.org_id=$1 AND l.created_at >= $2::date AND l.created_at < $3::date GROUP BY l.source`,
      [ctx.orgId, from, to],
    ),
    ctx.db.query<{ source: string | null; cents: unknown }>(
      `SELECT o.source, sum(CASE WHEN i.kind='credit_note' THEN -i.total_ht_cents ELSE i.total_ht_cents END) AS cents
       FROM invoices i
       LEFT JOIN LATERAL (SELECT l.source FROM leads l WHERE l.org_id=i.org_id AND l.customer_id=i.customer_id ORDER BY l.created_at LIMIT 1) o ON true
       WHERE i.org_id=$1 AND i.issue_date >= $2::date AND i.issue_date < $3::date GROUP BY o.source`,
      [ctx.orgId, from, to],
    ),
    getAcquisitionCosts(ctx, year),
  ]);
  const byLead = new Map(leads.map((r) => [r.source, r]));
  const byRevenue = new Map(revenue.map((r) => [r.source ?? UNKNOWN, num(r.cents)]));
  const rows: AcquisitionRow[] = SOURCES.map((source) => ({
    source,
    label: LEAD_SOURCES[source],
    ...metrics({
      leads: num(byLead.get(source)?.leads),
      won: num(byLead.get(source)?.won),
      revenueCents: byRevenue.get(source) ?? 0,
      costCents: costs[source] ?? 0,
    }),
  }));
  const unknown = byRevenue.get(UNKNOWN) ?? 0;
  if (unknown) rows.push({ source: UNKNOWN, label: "Origine non renseignée", ...metrics({ leads: 0, won: 0, revenueCents: unknown, costCents: 0 }) });
  return rows;
}
