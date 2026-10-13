/**
 * Révision de prix selon les index BT publiés par l'INSEE.
 *
 * Formule paramétrique usuelle : P = P0 x (F + (1 - F) x In / I0)
 *   F  part fixe non révisable (15 % par défaut)
 *   I0 valeur de l'index au mois de référence du devis
 *   In valeur de l'index au mois retenu pour la facture (en général celui des travaux)
 * Le coefficient est arrondi à 4 décimales, au plus proche.
 * Les valeurs d'index sont saisies par l'entreprise depuis les publications de l'INSEE.
 */

import { z } from "zod";
import { parseScaled } from "@/lib/calc/decimal";
import { formatPercent } from "@/lib/calc/format";
import { num, type Queryable } from "@/lib/db";
import { badRequest } from "@/lib/http";
import type { Ctx } from "./context";
import { audit, requireWritable } from "./context";
import type { PriceRevision } from "./quote-types";

import { BT_INDEXES, DEFAULT_FIXED_PERCENT } from "./revision-labels";

export { BT_INDEXES, DEFAULT_FIXED_PERCENT };
const CODE = /^BT\d{2}[a-z]?$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const isIndexCode = (v: string) => CODE.test(v);
export const isMonth = (v: string) => MONTH.test(v);
export const monthLabel = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`;

/** Valeur d'index en centièmes (les index BT sont publiés avec une décimale). */
export function indexToCenti(v: string): number {
  let x: bigint;
  try {
    x = parseScaled(v, 2);
  } catch {
    throw badRequest("Valeur d'index invalide");
  }
  if (x <= 0n || x > 10_000_000n) throw badRequest("Valeur d'index invalide");
  return Number(x);
}
export const centiToIndex = (c: number) => (c / 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

function fixedBp(p: string) {
  let bp: bigint;
  try {
    bp = parseScaled((p || DEFAULT_FIXED_PERCENT).replace("%", "").trim(), 2);
  } catch {
    throw badRequest("Part fixe invalide");
  }
  if (bp < 0n || bp > 10000n) throw badRequest("La part fixe doit être comprise entre 0 et 100 %");
  return bp;
}

/** Clause valide, ou null pour des prix fermes. */
export function normalizeRevision(r: Partial<PriceRevision> | null | undefined): PriceRevision | null {
  if (!r || !r.index) return null;
  const index = r.index
    .trim()
    .toUpperCase()
    .replace(/^BT(\d{2})([A-Z]?)$/, (_, n, l) => `BT${n}${l.toLowerCase()}`);
  if (!isIndexCode(index)) throw badRequest("Code d'index inconnu : BT suivi de deux chiffres, par exemple BT01");
  if (!isMonth(r.baseMonth ?? "")) throw badRequest("Mois de référence de l'index invalide");
  const fixedPercent = (r.fixedPercent ?? "").trim() || DEFAULT_FIXED_PERCENT;
  fixedBp(fixedPercent);
  return { index, baseMonth: r.baseMonth!, fixedPercent };
}

/** Coefficient de révision en dix-millièmes : 10000 = prix inchangés. */
export function revisionCoefficient(fixedPercent: string, baseCenti: number, currentCenti: number): number {
  if (baseCenti <= 0 || currentCenti <= 0) throw badRequest("Valeur d'index invalide");
  const f = fixedBp(fixedPercent);
  // k x 10000 = F + (10000 - F) x In / I0, arrondi au plus proche
  const numerator = f * BigInt(baseCenti) + (10000n - f) * BigInt(currentCenti);
  const den = BigInt(baseCenti);
  return Number((2n * numerator + den) / (2n * den));
}

export const coefficientText = (k: number) => (k / 10000).toLocaleString("fr-FR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/** Montant de révision d'une base hors taxe, au centime le plus proche (signé). */
export function revisionAmount(baseCents: number, k: number): number {
  const v = BigInt(baseCents) * BigInt(k - 10000);
  const half = 5000n;
  return Number(v >= 0n ? (v + half) / 10000n : -((-v + half) / 10000n));
}

export function revisionMention(r: PriceRevision): string {
  const f = Number(fixedBp(r.fixedPercent));
  const fixed = (f / 10000).toLocaleString("fr-FR", { maximumFractionDigits: 4 });
  const variable = ((10000 - f) / 10000).toLocaleString("fr-FR", { maximumFractionDigits: 4 });
  const label = BT_INDEXES[r.index] ? ` (${BT_INDEXES[r.index]})` : "";
  return (
    `Prix révisables selon l'index ${r.index}${label} publié par l'INSEE, valeur de référence I0 du mois de ${monthLabel(r.baseMonth)} : ` +
    `P = P0 x (${fixed} + ${variable} x In / I0), In étant la valeur de l'index du mois des travaux facturés.`
  );
}

/* ------------------------------------------------------------------ */
/* Valeurs d'index de l'entreprise                                     */
/* ------------------------------------------------------------------ */

export interface IndexValue {
  code: string;
  month: string;
  valueCenti: number;
}

export async function listIndexValues(ctx: Ctx, code?: string): Promise<IndexValue[]> {
  const rows = await ctx.db.query<{ code: string; month: string; value_centi: unknown }>(
    `SELECT code, month, value_centi FROM price_indexes WHERE org_id=$1 ${code ? "AND code=$2" : ""} ORDER BY code, month DESC`,
    code ? [ctx.orgId, code] : [ctx.orgId],
  );
  return rows.map((r) => ({ code: r.code, month: r.month, valueCenti: num(r.value_centi) }));
}

export async function indexValue(q: Queryable, orgId: string, code: string, month: string): Promise<number | null> {
  const r = await q.query<{ value_centi: unknown }>("SELECT value_centi FROM price_indexes WHERE org_id=$1 AND code=$2 AND month=$3", [
    orgId,
    code,
    month,
  ]);
  return r[0] ? num(r[0].value_centi) : null;
}

const valueSchema = z.object({ code: z.string().trim(), month: z.string().trim(), value: z.string().trim() });

export async function saveIndexValue(ctx: Ctx, raw: unknown) {
  requireWritable(ctx);
  const p = valueSchema.safeParse(raw);
  if (!p.success) throw badRequest("Valeur d'index incomplète");
  const code = p.data.code.toUpperCase().replace(/^BT(\d{2})([A-Z]?)$/, (_, n, l) => `BT${n}${l.toLowerCase()}`);
  if (!isIndexCode(code)) throw badRequest("Code d'index inconnu : BT suivi de deux chiffres, par exemple BT01");
  if (!isMonth(p.data.month)) throw badRequest("Mois invalide");
  const value = indexToCenti(p.data.value);
  await ctx.db.query(
    `INSERT INTO price_indexes (org_id, code, month, value_centi) VALUES ($1,$2,$3,$4)
     ON CONFLICT (org_id, code, month) DO UPDATE SET value_centi=EXCLUDED.value_centi, updated_at=now()`,
    [ctx.orgId, code, p.data.month, value],
  );
  await audit(ctx.db, { orgId: ctx.orgId, userId: ctx.userId, action: "price_index.save", data: { code, month: p.data.month, value }, ip: ctx.ip });
  return { code, month: p.data.month, valueCenti: value };
}

export async function deleteIndexValue(ctx: Ctx, code: string, month: string) {
  requireWritable(ctx);
  await ctx.db.query("DELETE FROM price_indexes WHERE org_id=$1 AND code=$2 AND month=$3", [ctx.orgId, code, month]);
}

/** Données figées sur la facture : index, valeurs et coefficient appliqué. */
export interface AppliedRevision {
  index: string;
  baseMonth: string;
  baseCenti: number;
  month: string;
  currentCenti: number;
  fixedPercent: string;
  /** Coefficient en dix-millièmes */
  coefficient: number;
}

export async function applicableRevision(q: Queryable, orgId: string, r: PriceRevision, month: string): Promise<AppliedRevision> {
  if (!isMonth(month)) throw badRequest("Mois de l'index invalide");
  if (month < r.baseMonth) throw badRequest(`Le mois de l'index ne peut pas précéder le mois de référence (${monthLabel(r.baseMonth)})`);
  const missing = (m: string) =>
    badRequest(`Valeur de l'index ${r.index} pour ${monthLabel(m)} manquante : renseignez-la dans Mon entreprise, onglet Tarifs.`);
  const base = await indexValue(q, orgId, r.index, r.baseMonth);
  if (base === null) throw missing(r.baseMonth);
  const current = await indexValue(q, orgId, r.index, month);
  if (current === null) throw missing(month);
  return {
    index: r.index,
    baseMonth: r.baseMonth,
    baseCenti: base,
    month,
    currentCenti: current,
    fixedPercent: r.fixedPercent,
    coefficient: revisionCoefficient(r.fixedPercent, base, current),
  };
}

export function revisionLabel(a: AppliedRevision, vatBp: number | null) {
  return (
    `Révision de prix : ${a.index} ${monthLabel(a.month)} = ${centiToIndex(a.currentCenti)}, ` +
    `référence ${monthLabel(a.baseMonth)} = ${centiToIndex(a.baseCenti)}, coefficient ${coefficientText(a.coefficient)}` +
    (vatBp === null ? "" : ` (travaux à TVA ${formatPercent(vatBp)})`)
  );
}
