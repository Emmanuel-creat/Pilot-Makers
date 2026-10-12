/**
 * Moteur de calcul des devis.
 *
 * Indépendant de l'interface : le navigateur, le serveur et le PDF appellent
 * tous cette même fonction, ce qui garantit des totaux identiques partout.
 *
 * Représentation des valeurs :
 * - montants en centimes d'euro (entiers) ;
 * - prix unitaires et coûts unitaires en dix-millièmes d'euro (4 décimales) ;
 * - quantités en millièmes (3 décimales) ;
 * - remises et taux de TVA en points de base (1 % = 100, 20 % = 2000).
 *
 * Règle d'arrondi (documentée dans docs/CALCULS.md) :
 * 1. chaque ligne est arrondie au centime : HT net = arrondi(quantité x prix x (1 - remise)) ;
 * 2. les lignes sont additionnées par taux de TVA ;
 * 3. une remise globale éventuelle est appliquée à chaque base de TVA, arrondie au centime ;
 * 4. la TVA est calculée une fois par taux sur la base nette, arrondie au centime ;
 * 5. TTC = total HT net + somme des TVA.
 * Arrondi au plus proche, la moitié étant arrondie vers l'extérieur de zéro.
 */

import { DecimalError, divRound, formatScaled, parseScaled } from "./decimal";

export const QTY_SCALE = 3;
export const PRICE_SCALE = 4;
export const BP_SCALE = 2; // pourcentages saisis avec 2 décimales -> points de base

export type LineKind = "item" | "pending" | "note";
export type LineNature = "materiau" | "main_oeuvre" | "deplacement" | "sous_traitance" | "forfait" | "autre";

export interface CalcLineInput {
  id: string;
  kind: LineKind;
  label?: string;
  /** Texte décimal, ex. "12,5" */
  quantity?: string;
  /** Prix unitaire HT, texte décimal en euros, ex. "45,90" */
  unitPrice?: string;
  /** Coût unitaire interne HT, texte décimal en euros (facultatif) */
  unitCost?: string;
  /** Remise en pourcentage, texte décimal, ex. "10" pour 10 % */
  discountPercent?: string;
  /** Taux de TVA en pourcentage, ex. "20", "10", "5,5" */
  vatPercent?: string;
  nature?: LineNature;
}

export interface CalcSectionInput {
  id: string;
  title?: string;
  lines: CalcLineInput[];
}

export interface CalcInput {
  sections: CalcSectionInput[];
  /** Remise globale en pourcentage (facultative) */
  globalDiscountPercent?: string;
  /** Franchise en base de TVA : tous les taux sont forcés à 0 */
  vatExempt?: boolean;
}

export interface CalcIssue {
  lineId?: string;
  field?: string;
  code: string;
  message: string;
  blocking: boolean;
}

export interface CalcLineResult {
  id: string;
  kind: LineKind;
  quantityMilli: number;
  unitPrice4: number;
  unitCost4: number | null;
  discountBp: number;
  vatBp: number;
  grossCents: number;
  discountCents: number;
  netCents: number;
  costCents: number | null;
}

export interface CalcSectionResult {
  id: string;
  subtotalCents: number;
  lines: CalcLineResult[];
}

export interface VatGroup {
  vatBp: number;
  baseCents: number;
  vatCents: number;
}

export interface CalcResult {
  sections: CalcSectionResult[];
  grossCents: number;
  lineDiscountCents: number;
  /** Total HT après remises de ligne, avant remise globale */
  subtotalCents: number;
  globalDiscountBp: number;
  globalDiscountCents: number;
  totalHtCents: number;
  vatGroups: VatGroup[];
  totalVatCents: number;
  totalTtcCents: number;
  margin: {
    /** Coûts directs estimés connus */
    costCents: number;
    /** Lignes chiffrées sans coût interne renseigné */
    linesWithoutCost: number;
    marginCents: number;
    /** Taux de marge sur vente, en points de base (marge / vente HT) */
    marginRateBp: number | null;
    /** Taux de majoration du coût de revient, en points de base (marge / coût) */
    markupRateBp: number | null;
  };
  issues: CalcIssue[];
  ok: boolean;
}

export const ALLOWED_VAT_BP = [0, 210, 550, 850, 1000, 2000] as const;

function toNum(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new DecimalError("Montant hors limites");
  return n;
}

function parseField(
  value: string | undefined,
  scale: number,
  field: string,
  lineId: string,
  issues: CalcIssue[],
  opts: { required: boolean; min?: bigint; max?: bigint; label: string },
): bigint | null {
  if (value === undefined || value === null || String(value).trim() === "") {
    if (opts.required) {
      issues.push({ lineId, field, code: "missing", message: `${opts.label} manquant(e)`, blocking: true });
    }
    return null;
  }
  try {
    const v = parseScaled(value, scale);
    if (opts.min !== undefined && v < opts.min) {
      issues.push({ lineId, field, code: "too_small", message: `${opts.label} ne peut pas être négatif(ve)`, blocking: true });
      return null;
    }
    if (opts.max !== undefined && v > opts.max) {
      issues.push({ lineId, field, code: "too_large", message: `${opts.label} trop élevé(e)`, blocking: true });
      return null;
    }
    return v;
  } catch (e) {
    issues.push({ lineId, field, code: "invalid", message: `${opts.label} : ${(e as Error).message}`, blocking: true });
    return null;
  }
}

const MAX_QTY = 1_000_000_000n; // 1 000 000,000
const MAX_PRICE = 10_000_000_000n; // 1 000 000,0000 euros

export function computeQuote(input: CalcInput): CalcResult {
  const issues: CalcIssue[] = [];
  const sections: CalcSectionResult[] = [];
  const groups = new Map<number, bigint>();
  let gross = 0n;
  let lineDiscount = 0n;
  let subtotal = 0n;
  let cost = 0n;
  let linesWithoutCost = 0;
  let pricedLines = 0;

  for (const section of input.sections) {
    let sectionTotal = 0n;
    const lines: CalcLineResult[] = [];
    for (const line of section.lines) {
      const empty: CalcLineResult = {
        id: line.id,
        kind: line.kind,
        quantityMilli: 0,
        unitPrice4: 0,
        unitCost4: null,
        discountBp: 0,
        vatBp: 0,
        grossCents: 0,
        discountCents: 0,
        netCents: 0,
        costCents: null,
      };
      if (line.kind === "note") {
        lines.push(empty);
        continue;
      }
      if (line.kind === "pending") {
        issues.push({
          lineId: line.id,
          code: "pending_line",
          message: `Ligne à compléter : ${line.label || "sans libellé"}`,
          blocking: true,
        });
        lines.push(empty);
        continue;
      }
      if (!line.label || !line.label.trim()) {
        issues.push({ lineId: line.id, field: "label", code: "missing", message: "Libellé manquant", blocking: true });
      }
      const qty = parseField(line.quantity, QTY_SCALE, "quantity", line.id, issues, {
        required: true,
        min: 0n,
        max: MAX_QTY,
        label: "Quantité",
      });
      const price = parseField(line.unitPrice, PRICE_SCALE, "unitPrice", line.id, issues, {
        required: true,
        min: 0n,
        max: MAX_PRICE,
        label: "Prix unitaire",
      });
      const unitCost = parseField(line.unitCost, PRICE_SCALE, "unitCost", line.id, issues, {
        required: false,
        min: 0n,
        max: MAX_PRICE,
        label: "Coût unitaire",
      });
      const disc =
        parseField(line.discountPercent, BP_SCALE, "discountPercent", line.id, issues, {
          required: false,
          min: 0n,
          max: 10000n,
          label: "Remise",
        }) ?? 0n;
      let vat = parseField(line.vatPercent, BP_SCALE, "vatPercent", line.id, issues, {
        required: !input.vatExempt,
        min: 0n,
        max: 10000n,
        label: "Taux de TVA",
      });
      if (input.vatExempt) vat = 0n;
      if (vat !== null && !ALLOWED_VAT_BP.includes(Number(vat) as (typeof ALLOWED_VAT_BP)[number])) {
        issues.push({
          lineId: line.id,
          field: "vatPercent",
          code: "unusual_vat",
          message: `Taux de TVA inhabituel : ${formatScaled(vat, 2)} %`,
          blocking: false,
        });
      }
      if (qty === null || price === null || vat === null) {
        lines.push(empty);
        continue;
      }
      if (qty === 0n) {
        issues.push({ lineId: line.id, field: "quantity", code: "zero_qty", message: "Quantité nulle", blocking: false });
      }
      // qty (x1000) * price (x10000) -> centimes : diviser par 1000 * 100
      const grossCents = divRound(qty * price, 1000n * 100n);
      const netCents = divRound(qty * price * (10000n - disc), 1000n * 100n * 10000n);
      const discCents = grossCents - netCents;
      let lineCost: bigint | null = null;
      if (unitCost !== null) {
        lineCost = divRound(qty * unitCost, 1000n * 100n);
        cost += lineCost;
      } else {
        linesWithoutCost++;
      }
      pricedLines++;
      gross += grossCents;
      lineDiscount += discCents;
      subtotal += netCents;
      sectionTotal += netCents;
      groups.set(Number(vat), (groups.get(Number(vat)) ?? 0n) + netCents);
      lines.push({
        id: line.id,
        kind: line.kind,
        quantityMilli: toNum(qty),
        unitPrice4: toNum(price),
        unitCost4: unitCost === null ? null : toNum(unitCost),
        discountBp: toNum(disc),
        vatBp: toNum(vat),
        grossCents: toNum(grossCents),
        discountCents: toNum(discCents),
        netCents: toNum(netCents),
        costCents: lineCost === null ? null : toNum(lineCost),
      });
    }
    sections.push({ id: section.id, subtotalCents: toNum(sectionTotal), lines });
  }

  const gd =
    parseField(input.globalDiscountPercent, BP_SCALE, "globalDiscountPercent", "", issues, {
      required: false,
      min: 0n,
      max: 10000n,
      label: "Remise globale",
    }) ?? 0n;

  const vatGroups: VatGroup[] = [];
  let globalDiscount = 0n;
  let totalHt = 0n;
  let totalVat = 0n;
  const rates = [...groups.keys()].sort((a, b) => b - a);
  for (const rate of rates) {
    const base = groups.get(rate)!;
    const gdCents = divRound(base * gd, 10000n);
    const netBase = base - gdCents;
    const vatCents = divRound(netBase * BigInt(rate), 10000n);
    globalDiscount += gdCents;
    totalHt += netBase;
    totalVat += vatCents;
    vatGroups.push({ vatBp: rate, baseCents: toNum(netBase), vatCents: toNum(vatCents) });
  }

  if (pricedLines === 0) {
    issues.push({ code: "no_lines", message: "Le devis ne contient aucune ligne chiffrée", blocking: true });
  }

  const marginCents = totalHt - cost;
  const marginRateBp = totalHt > 0n ? toNum(divRound(marginCents * 10000n, totalHt)) : null;
  const markupRateBp = cost > 0n ? toNum(divRound(marginCents * 10000n, cost)) : null;

  return {
    sections,
    grossCents: toNum(gross),
    lineDiscountCents: toNum(lineDiscount),
    subtotalCents: toNum(subtotal),
    globalDiscountBp: toNum(gd),
    globalDiscountCents: toNum(globalDiscount),
    totalHtCents: toNum(totalHt),
    vatGroups,
    totalVatCents: toNum(totalVat),
    totalTtcCents: toNum(totalHt + totalVat),
    margin: {
      costCents: toNum(cost),
      linesWithoutCost,
      marginCents: toNum(marginCents),
      marginRateBp,
      markupRateBp,
    },
    issues,
    ok: !issues.some((i) => i.blocking),
  };
}
