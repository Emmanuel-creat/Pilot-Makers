/**
 * Plan comptable de l'entreprise : comptes utilisés dans le fichier des écritures comptables (FEC),
 * repris du plan de son cabinet, et ventilation des ventes par nature de prestation.
 *
 * Sans réglage, les comptes standards du plan comptable général s'appliquent.
 */

import { z } from "zod";
import { badRequest } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requirePermission, requireWritable } from "./context";

export interface AccountingPlan {
  customers: string;
  /** Prestations de services (main-d'œuvre, forfaits) */
  sales: string;
  /** Fournitures et matériaux revendus */
  goods: string;
  subcontracting: string;
  travel: string;
  deposits: string;
  bank: string;
  /** TVA collectée par taux, en points de base */
  vat: Record<number, string>;
  /** Préfixe des comptes clients auxiliaires */
  auxPrefix: string;
  /** Ventiler le chiffre d'affaires par nature de ligne */
  ventilate: boolean;
}

export const DEFAULT_PLAN: AccountingPlan = {
  customers: "411000",
  sales: "706000",
  goods: "707000",
  subcontracting: "706100",
  travel: "708500",
  deposits: "419100",
  bank: "512000",
  vat: { 2000: "445711", 1000: "445712", 550: "445713", 210: "445714", 0: "445710" },
  auxPrefix: "C",
  ventilate: false,
};

export const PLAN_FIELDS: { key: Exclude<keyof AccountingPlan, "vat" | "ventilate" | "auxPrefix">; label: string }[] = [
  { key: "customers", label: "Clients" },
  { key: "sales", label: "Prestations de services (main-d'œuvre, forfaits)" },
  { key: "goods", label: "Fournitures et matériaux" },
  { key: "subcontracting", label: "Travaux sous-traités" },
  { key: "travel", label: "Frais de déplacement refacturés" },
  { key: "deposits", label: "Acomptes reçus" },
  { key: "bank", label: "Banque" },
];

export const VAT_RATES = [2000, 1000, 550, 210] as const;

/** Compte de vente d'une ligne selon sa nature. */
export function salesAccount(plan: AccountingPlan, nature: string) {
  if (!plan.ventilate) return plan.sales;
  if (nature === "materiau") return plan.goods;
  if (nature === "sous_traitance") return plan.subcontracting;
  if (nature === "deplacement") return plan.travel;
  return plan.sales;
}

export function vatAccountOf(plan: AccountingPlan, bp: number) {
  return plan.vat[bp] ?? plan.vat[0] ?? DEFAULT_PLAN.vat[0];
}

const ACCOUNT = /^[0-9][0-9A-Z]{2,11}$/;

export function readPlan(raw: unknown): AccountingPlan {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const acc = (v: unknown, d: string) => (typeof v === "string" && ACCOUNT.test(v) ? v : d);
  const vatRaw = (o.vat && typeof o.vat === "object" ? o.vat : {}) as Record<string, unknown>;
  const vat: Record<number, string> = {};
  for (const [bp, d] of Object.entries(DEFAULT_PLAN.vat)) vat[Number(bp)] = acc(vatRaw[bp], d);
  return {
    customers: acc(o.customers, DEFAULT_PLAN.customers),
    sales: acc(o.sales, DEFAULT_PLAN.sales),
    goods: acc(o.goods, DEFAULT_PLAN.goods),
    subcontracting: acc(o.subcontracting, DEFAULT_PLAN.subcontracting),
    travel: acc(o.travel, DEFAULT_PLAN.travel),
    deposits: acc(o.deposits, DEFAULT_PLAN.deposits),
    bank: acc(o.bank, DEFAULT_PLAN.bank),
    vat,
    auxPrefix: typeof o.auxPrefix === "string" && /^[A-Z0-9]{0,4}$/.test(o.auxPrefix) ? o.auxPrefix : DEFAULT_PLAN.auxPrefix,
    ventilate: o.ventilate === true,
  };
}

const account = (label: string) =>
  z.string().trim().toUpperCase().regex(ACCOUNT, `${label} : numéro de compte invalide (3 à 12 caractères, commençant par un chiffre)`);

const planSchema = z.object({
  customers: account("Clients"),
  sales: account("Prestations de services"),
  goods: account("Fournitures et matériaux"),
  subcontracting: account("Travaux sous-traités"),
  travel: account("Frais de déplacement"),
  deposits: account("Acomptes reçus"),
  bank: account("Banque"),
  vat2000: account("TVA à 20 %"),
  vat1000: account("TVA à 10 %"),
  vat550: account("TVA à 5,5 %"),
  vat210: account("TVA à 2,1 %"),
  auxPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{0,4}$/, "Préfixe des comptes clients : 4 lettres ou chiffres au plus"),
  ventilate: z.boolean(),
});

export async function getPlan(ctx: Ctx) {
  const r = await ctx.db.query<{ accounting: unknown }>("SELECT accounting FROM organizations WHERE id=$1", [ctx.orgId]);
  return readPlan(r[0]?.accounting);
}

export async function savePlan(ctx: Ctx, raw: unknown) {
  requirePermission(ctx, "settings");
  requireWritable(ctx);
  const p = planSchema.safeParse(raw);
  if (!p.success) throw badRequest(p.error.issues[0].message, p.error.issues);
  const d = p.data;
  const plan: AccountingPlan = {
    customers: d.customers,
    sales: d.sales,
    goods: d.goods,
    subcontracting: d.subcontracting,
    travel: d.travel,
    deposits: d.deposits,
    bank: d.bank,
    vat: { 2000: d.vat2000, 1000: d.vat1000, 550: d.vat550, 210: d.vat210, 0: DEFAULT_PLAN.vat[0] },
    auxPrefix: d.auxPrefix,
    ventilate: d.ventilate,
  };
  await ctx.db.query("UPDATE organizations SET accounting=$2 WHERE id=$1", [ctx.orgId, JSON.stringify(plan)]);
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "org.accounting_plan", target: ctx.orgId, ip: ctx.ip });
  return plan;
}

/** Répartit un montant entre des poids, au centime près (le reste va au plus gros poste). */
export function ventilate(total: number, weights: Map<string, number>): Map<string, number> {
  const entries = [...weights.entries()].filter(([, w]) => w > 0);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  const out = new Map<string, number>();
  if (!entries.length || !sum) return out;
  entries.sort((a, b) => b[1] - a[1]);
  let left = total;
  for (const [k, w] of entries.slice(1)) {
    const part = Math.round((total * w) / sum);
    out.set(k, part);
    left -= part;
  }
  out.set(entries[0][0], left);
  return out;
}
