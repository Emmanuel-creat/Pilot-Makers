/**
 * Rentabilité réelle des chantiers regroupée par client, par type de chantier et par nature de prestation.
 *
 * Vendu : montant HT des tâches issues du devis accepté. Coûts réels : heures pointées valorisées
 * au coût de chaque personne, plus achats saisis sur le chantier.
 */

import { num } from "@/lib/db";
import { jobType } from "@/lib/job-types";
import type { Ctx } from "./context";
import { requirePermission } from "./context";
import { memberCosts } from "./timesheets";

export interface JobProfit {
  jobId: string;
  title: string;
  customerId: string | null;
  customerName: string;
  type: string;
  status: string;
  soldCents: number;
  laborCents: number;
  purchasesCents: number;
}

export interface ProfitGroup {
  key: string;
  label: string;
  jobs: number;
  soldCents: number;
  costCents: number;
  marginCents: number;
  /** Marge sur le vendu, en points de base, ou null sans vente */
  marginBp: number | null;
}

export function groupProfits(jobs: readonly JobProfit[], keyOf: (j: JobProfit) => [string, string]): ProfitGroup[] {
  const groups = new Map<string, ProfitGroup>();
  for (const j of jobs) {
    const [key, label] = keyOf(j);
    const g = groups.get(key) ?? { key, label, jobs: 0, soldCents: 0, costCents: 0, marginCents: 0, marginBp: null };
    g.jobs++;
    g.soldCents += j.soldCents;
    g.costCents += j.laborCents + j.purchasesCents;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      marginCents: g.soldCents - g.costCents,
      marginBp: g.soldCents > 0 ? Math.round(((g.soldCents - g.costCents) * 10000) / g.soldCents) : null,
    }))
    .sort((a, b) => b.marginCents - a.marginCents);
}

/** Vendu et coûts réels par nature : main-d'œuvre face aux heures, matériaux et sous-traitance face aux achats. */
export interface NatureProfit {
  nature: "main_oeuvre" | "materiau" | "sous_traitance" | "autre";
  soldCents: number;
  costCents: number;
}

export async function profitability(ctx: Ctx, opts: { since?: string } = {}) {
  requirePermission(ctx, "costs");
  const since = opts.since && /^\d{4}-\d{2}-\d{2}$/.test(opts.since) ? opts.since : "1900-01-01";
  const jobs = await ctx.db.query<Record<string, unknown>>(
    `SELECT j.id, j.title, j.status, j.customer_id,
       coalesce(nullif(c.company_name, ''), nullif(trim(c.first_name || ' ' || c.last_name), ''), 'Sans client') AS customer_name
     FROM jobs j LEFT JOIN customers c ON c.id=j.customer_id
     WHERE j.org_id=$1 AND j.status IN ('en_cours', 'termine', 'receptionne') AND coalesce(j.start_date, j.created_at::date) >= $2
     ORDER BY j.created_at DESC LIMIT 1000`,
    [ctx.orgId, since],
  );
  const ids = jobs.map((j) => String(j.id));
  if (!ids.length) return { jobs: [] as JobProfit[], natures: [] as NatureProfit[] };
  const [tasks, hours, purchases, costs] = await Promise.all([
    ctx.db.query<{ job_id: string; nature: string; sold: unknown }>(
      "SELECT job_id, nature, sum(weight_cents) AS sold FROM job_tasks WHERE job_id = ANY($1::uuid[]) GROUP BY job_id, nature",
      [ids],
    ),
    ctx.db.query<{ job_id: string; user_id: string; minutes: unknown }>(
      "SELECT job_id, user_id, sum(minutes) AS minutes FROM time_entries WHERE org_id=$1 AND job_id = ANY($2::uuid[]) AND status <> 'refuse' GROUP BY job_id, user_id",
      [ctx.orgId, ids],
    ),
    ctx.db.query<{ job_id: string; category: string; amount: unknown }>(
      "SELECT job_id, category, sum(amount_ht_cents) AS amount FROM job_purchases WHERE org_id=$1 AND job_id = ANY($2::uuid[]) GROUP BY job_id, category",
      [ctx.orgId, ids],
    ),
    memberCosts(ctx.db, ctx.orgId),
  ]);
  const by = new Map<string, JobProfit>(
    jobs.map((j) => [
      String(j.id),
      {
        jobId: String(j.id),
        title: String(j.title),
        customerId: (j.customer_id as string | null) ?? null,
        customerName: String(j.customer_name),
        type: jobType(String(j.title)),
        status: String(j.status),
        soldCents: 0,
        laborCents: 0,
        purchasesCents: 0,
      },
    ]),
  );
  const natures = new Map<NatureProfit["nature"], NatureProfit>(
    (["main_oeuvre", "materiau", "sous_traitance", "autre"] as const).map((n) => [n, { nature: n, soldCents: 0, costCents: 0 }]),
  );
  const natureOf = (n: string): NatureProfit["nature"] => (n === "main_oeuvre" || n === "materiau" || n === "sous_traitance" ? n : "autre");
  for (const t of tasks) {
    by.get(t.job_id)!.soldCents += num(t.sold);
    natures.get(natureOf(t.nature))!.soldCents += num(t.sold);
  }
  for (const h of hours) {
    const c = Math.round((num(h.minutes) * (costs.get(h.user_id)?.costCents ?? 0)) / 60);
    by.get(h.job_id)!.laborCents += c;
    natures.get("main_oeuvre")!.costCents += c;
  }
  for (const p of purchases) {
    by.get(p.job_id)!.purchasesCents += num(p.amount);
    natures.get(p.category === "materiau" ? "materiau" : p.category === "sous_traitance" ? "sous_traitance" : "autre")!.costCents += num(p.amount);
  }
  return { jobs: [...by.values()], natures: [...natures.values()].filter((n) => n.soldCents || n.costCents) };
}
