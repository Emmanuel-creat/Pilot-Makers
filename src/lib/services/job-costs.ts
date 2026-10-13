/**
 * Coûts réels d'un chantier comparés au devis : achats affectés (fournitures, sous-traitance,
 * location), heures pointées valorisées au coût de la qualification, marge prévue et réelle,
 * alerte quand le budget prévu est presque consommé ou dépassé.
 */

import { z } from "zod";
import { num, one } from "@/lib/db";
import { badRequest, isUuid, notFound } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requireRole, requireWritable } from "./context";
import { getJob } from "./jobs";
import { eurosToCents } from "./pricing";
import { jobHours } from "./timesheets";

export const PURCHASE_CATEGORIES = {
  materiau: "Fournitures",
  sous_traitance: "Sous-traitance",
  location: "Location de matériel",
  autre: "Autre",
} as const;
export type PurchaseCategory = keyof typeof PURCHASE_CATEGORIES;

export interface Purchase {
  id: string;
  task_id: string | null;
  task_label: string | null;
  purchase_date: string;
  supplier: string;
  label: string;
  category: PurchaseCategory;
  amount_ht_cents: number;
  reference: string;
}

export type BudgetAlert = "none" | "warning" | "over";

const purchaseSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  label: z.string().trim().min(1, "Indiquez ce qui a été acheté").max(200),
  supplier: z.string().trim().max(120).optional().default(""),
  category: z.enum(Object.keys(PURCHASE_CATEGORIES) as [PurchaseCategory, ...PurchaseCategory[]]).default("materiau"),
  amount: z.string().trim().min(1, "Indiquez le montant HT"),
  taskId: z.string().optional().default(""),
  reference: z.string().trim().max(80).optional().default(""),
});

/** Achat affecté au chantier (montant HT ; négatif pour un avoir fournisseur). */
export async function addPurchase(ctx: Ctx, jobId: string, raw: unknown) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  await getJob(ctx, jobId);
  const p = purchaseSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message);
  const negative = p.data.amount.trim().startsWith("-");
  let cents: number;
  try {
    cents = eurosToCents(p.data.amount.replace(/^-/, "").replace(/[\s€]/g, ""), "Montant");
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  if (cents === 0) throw badRequest("Montant nul");
  if (cents > 10_000_000_00) throw badRequest("Montant trop élevé");
  let taskId: string | null = null;
  if (p.data.taskId) {
    if (!isUuid(p.data.taskId) || !(await one(ctx.db, "SELECT 1 FROM job_tasks WHERE id=$1 AND job_id=$2", [p.data.taskId, jobId])))
      throw badRequest("Tâche introuvable");
    taskId = p.data.taskId;
  }
  const r = await one<{ id: string }>(
    ctx.db,
    `INSERT INTO job_purchases (org_id, job_id, task_id, purchase_date, supplier, label, category, amount_ht_cents, reference, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [ctx.orgId, jobId, taskId, p.data.date, p.data.supplier, p.data.label, p.data.category, negative ? -cents : cents, p.data.reference, ctx.userId],
  );
  await audit(ctx.db, {
    orgId: ctx.orgId,
    userId: ctx.userId,
    action: "job.purchase",
    target: jobId,
    data: { amount: negative ? -cents : cents },
    ip: ctx.ip,
  });
  return r!.id;
}

export async function deletePurchase(ctx: Ctx, id: string) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  const r = await ctx.db.query("DELETE FROM job_purchases WHERE id=$1 AND org_id=$2 RETURNING id", [isUuid(id) ? id : null, ctx.orgId]);
  if (!r.length) throw notFound("Achat introuvable");
}

export async function listPurchases(ctx: Ctx, jobId: string): Promise<Purchase[]> {
  const rows = await ctx.db.query<Record<string, unknown>>(
    `SELECT p.*, t.label AS task_label FROM job_purchases p LEFT JOIN job_tasks t ON t.id=p.task_id
     WHERE p.job_id=$1 AND p.org_id=$2 ORDER BY p.purchase_date DESC, p.created_at DESC`,
    [jobId, ctx.orgId],
  );
  return rows.map((r) => ({
    id: String(r.id),
    task_id: (r.task_id as string | null) ?? null,
    task_label: (r.task_label as string | null) ?? null,
    purchase_date: r.purchase_date instanceof Date ? r.purchase_date.toISOString().slice(0, 10) : String(r.purchase_date).slice(0, 10),
    supplier: String(r.supplier),
    label: String(r.label),
    category: r.category as PurchaseCategory,
    amount_ht_cents: num(r.amount_ht_cents),
    reference: String(r.reference),
  }));
}

export function budgetAlert(plannedCents: number, realCents: number, thresholdBp: number): BudgetAlert {
  if (plannedCents <= 0) return "none";
  if (realCents > plannedCents) return "over";
  return realCents * 10000 >= plannedCents * thresholdBp ? "warning" : "none";
}

/** Bilan prévu et réel du chantier, globalement et ligne par ligne. */
export async function jobCosts(ctx: Ctx, jobId: string) {
  requireRole(ctx, "admin");
  const { job, tasks, progressBp } = await getJob(ctx, jobId);
  const [purchases, hours, threshold] = await Promise.all([
    listPurchases(ctx, jobId),
    jobHours(ctx, jobId),
    one<{ budget_alert_bp: unknown }>(ctx.db, "SELECT budget_alert_bp FROM jobs WHERE id=$1", [jobId]),
  ]);
  const soldCents = tasks.reduce((a, t) => a + t.weight_cents, 0);
  const plannedLabor = tasks.filter((t) => t.nature === "main_oeuvre").reduce((a, t) => a + (t.cost_cents ?? 0), 0);
  const plannedPurchases = tasks.filter((t) => t.nature !== "main_oeuvre").reduce((a, t) => a + (t.cost_cents ?? 0), 0);
  const realPurchases = purchases.reduce((a, p) => a + p.amount_ht_cents, 0);
  const plannedTotal = plannedLabor + plannedPurchases;
  const realTotal = hours.costCents + realPurchases;
  const thresholdBp = num(threshold?.budget_alert_bp) || 9000;
  const byTask = new Map<string, number>();
  for (const p of purchases) if (p.task_id) byTask.set(p.task_id, (byTask.get(p.task_id) ?? 0) + p.amount_ht_cents);
  return {
    jobId: job.id,
    soldCents,
    progressBp,
    thresholdBp,
    hasPlannedCosts: tasks.some((t) => t.cost_cents !== null),
    planned: { laborCents: plannedLabor, purchasesCents: plannedPurchases, totalCents: plannedTotal, marginCents: soldCents - plannedTotal },
    real: {
      laborCents: hours.costCents,
      laborMinutes: hours.minutes,
      purchasesCents: realPurchases,
      totalCents: realTotal,
      marginCents: soldCents - realTotal,
    },
    /** Part du budget prévu déjà consommée, en points de base */
    consumedBp: plannedTotal > 0 ? Math.round((realTotal * 10000) / plannedTotal) : null,
    alert: budgetAlert(plannedTotal, realTotal, thresholdBp),
    tasks: tasks.map((t) => {
      const real = byTask.get(t.id) ?? 0;
      return {
        id: t.id,
        section: t.section,
        label: t.label,
        nature: t.nature,
        soldCents: t.weight_cents,
        plannedCostCents: t.cost_cents,
        realPurchasesCents: real,
        // L'écart ligne par ligne ne compare que les achats : la main-d'oeuvre réelle est suivie pour le chantier entier.
        gapCents: t.nature === "main_oeuvre" || t.cost_cents === null ? null : t.cost_cents - real,
        progressBp: t.progress_bp,
      };
    }),
    unassignedPurchasesCents: purchases.filter((p) => !p.task_id).reduce((a, p) => a + p.amount_ht_cents, 0),
  };
}

export async function setBudgetThreshold(ctx: Ctx, jobId: string, percent: string) {
  requireWritable(ctx);
  requireRole(ctx, "admin");
  const n = Number(percent);
  if (!Number.isInteger(n) || n < 50 || n > 150) throw badRequest("Seuil entre 50 et 150 %");
  const r = await ctx.db.query("UPDATE jobs SET budget_alert_bp=$3 WHERE id=$1 AND org_id=$2 RETURNING id", [
    isUuid(jobId) ? jobId : null,
    ctx.orgId,
    n * 100,
  ]);
  if (!r.length) throw notFound("Chantier introuvable");
}

/** Chantiers ouverts dont le budget est presque consommé ou dépassé, pour le tableau de bord. */
export async function budgetAlerts(ctx: Ctx) {
  if (ctx.role === "member") return [];
  const jobs = await ctx.db.query<{ id: string }>(
    `SELECT DISTINCT j.id FROM jobs j
     WHERE j.org_id=$1 AND j.status IN ('a_planifier', 'en_cours', 'termine')
       AND (EXISTS (SELECT 1 FROM job_purchases p WHERE p.job_id=j.id) OR EXISTS (SELECT 1 FROM time_entries t WHERE t.job_id=j.id))
     LIMIT 100`,
    [ctx.orgId],
  );
  const out: { id: string; title: string; alert: BudgetAlert; consumedBp: number | null }[] = [];
  for (const j of jobs) {
    const c = await jobCosts(ctx, j.id);
    if (c.alert !== "none") {
      const t = await one<{ title: string }>(ctx.db, "SELECT title FROM jobs WHERE id=$1", [j.id]);
      out.push({ id: j.id, title: t?.title ?? "", alert: c.alert, consumedBp: c.consumedBp });
    }
  }
  return out.sort((a, b) => (b.consumedBp ?? 0) - (a.consumedBp ?? 0));
}
