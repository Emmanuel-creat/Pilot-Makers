/**
 * Marchés publics : lecture d'un DPGF, d'un BPU ou d'un DQE fourni par l'acheteur (tableur), reconnaissance
 * des colonnes, rapprochement des postes avec le catalogue, puis restitution du même tableau rempli.
 */

import { normalizeText } from "@/lib/fuzzy";
import { cleanAmount, headerKey } from "@/lib/sheet";

export type Column = "ref" | "label" | "unit" | "quantity" | "price" | "amount";
export type TenderKind = "dpgf" | "bpu";

const HEADERS: Record<Column, string[]> = {
  ref: ["n", "no", "num", "numero", "art", "article", "poste", "ref", "reference", "code", "item", "n art", "n poste"],
  label: [
    "designation",
    "designation des ouvrages",
    "designation des travaux",
    "libelle",
    "description",
    "intitule",
    "nature des travaux",
    "ouvrage",
    "ouvrages",
  ],
  unit: ["u", "un", "unite", "unites"],
  quantity: ["q", "qt", "qte", "qtes", "quantite", "quantites", "quantite estimee", "qte estimee"],
  price: ["pu", "p u", "pu ht", "p u ht", "prix unitaire", "prix unitaire ht", "prix u ht", "prix"],
  amount: ["montant", "montant ht", "total", "total ht", "prix total", "prix total ht", "pt", "p t", "pt ht", "montant total ht"],
};

export interface TenderColumns {
  headerRow: number;
  cols: Partial<Record<Column, number>>;
}

export interface TenderItem {
  row: number;
  ref: string;
  label: string;
  unit: string;
  quantity: string;
  section: boolean;
}

function columnOf(key: string): Column | null {
  const k = key.replace(/\s*(en )?(eur|euros?)$/, "").trim();
  for (const [c, names] of Object.entries(HEADERS) as [Column, string[]][]) if (names.includes(k)) return c;
  return null;
}

/** Ligne d'en-tête : la première des 30 premières lignes qui nomme la désignation et au moins l'unité, la quantité ou le prix. */
export function detectColumns(rows: string[][]): TenderColumns | null {
  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const cols: Partial<Record<Column, number>> = {};
    rows[r].forEach((cell, i) => {
      const c = columnOf(headerKey(cell));
      if (c && cols[c] === undefined) cols[c] = i;
    });
    if (cols.label !== undefined && (cols.unit !== undefined || cols.quantity !== undefined || cols.price !== undefined)) return { headerRow: r, cols };
  }
  return null;
}

export function readItems(rows: string[][], t: TenderColumns): { kind: TenderKind; items: TenderItem[] } {
  const cell = (row: string[], c: Column) => (t.cols[c] === undefined ? "" : (row[t.cols[c]!] ?? "").trim());
  const items: TenderItem[] = [];
  for (let r = t.headerRow + 1; r < rows.length; r++) {
    const label = cell(rows[r], "label");
    if (!label) continue;
    if (/^(total|sous[- ]total|montant total|total general|tva|montant ttc)\b/i.test(normalizeText(label))) continue;
    const unit = cell(rows[r], "unit");
    const quantity = cleanAmount(cell(rows[r], "quantity"), 3);
    const section = !unit && !quantity;
    items.push({ row: r, ref: cell(rows[r], "ref"), label, unit, quantity: /^\d/.test(quantity) ? quantity : "", section });
  }
  const lines = items.filter((i) => !i.section);
  return { kind: lines.some((i) => i.quantity) ? "dpgf" : "bpu", items };
}

const STOP = new Set([
  "des",
  "les",
  "une",
  "pour",
  "par",
  "avec",
  "sur",
  "dans",
  "compris",
  "y",
  "et",
  "de",
  "du",
  "la",
  "le",
  "en",
  "au",
  "aux",
  "type",
  "fourniture",
  "pose",
  "mise",
  "oeuvre",
]);
const words = (s: string) =>
  new Set(
    normalizeText(s)
      .split(" ")
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );

/** Ressemblance entre une désignation et un article : mots significatifs communs, bonus si l'unité est la même. */
export function labelSimilarity(a: string, b: string, unitA = "", unitB = ""): number {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return 0;
  let common = 0;
  for (const w of x) if (y.has(w)) common++;
  const base = common / Math.min(x.size, y.size) / (1 + Math.abs(x.size - y.size) / 10);
  const sameUnit = unitA && unitB && normalizeText(unitA).replace(/ /g, "") === normalizeText(unitB).replace(/ /g, "");
  return Math.min(1, base + (sameUnit ? 0.1 : 0));
}

export const MATCH_THRESHOLD = 0.6;

export function bestMatch<T extends { name: string; unit: string }>(item: TenderItem, catalog: readonly T[]): { item: T; score: number } | null {
  let best: { item: T; score: number } | null = null;
  for (const c of catalog) {
    const s = labelSimilarity(item.label, c.name, item.unit, c.unit);
    if (s >= MATCH_THRESHOLD && (!best || s > best.score)) best = { item: c, score: s };
  }
  return best;
}

const euros = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/**
 * Tableau d'origine rempli : prix unitaire et montant de chaque poste chiffré, colonnes ajoutées si absentes,
 * total HT en dernière ligne. `prices` associe le numéro de ligne du tableau au prix unitaire HT en centimes.
 */
export function fillTable(rows: string[][], t: TenderColumns, prices: ReadonlyMap<number, { unitCents: number; quantity: string }>): string[][] {
  const width = Math.max(...rows.map((r) => r.length));
  const priceCol = t.cols.price ?? width;
  const amountCol = t.cols.amount ?? (t.cols.price === undefined ? width + 1 : width);
  const out = rows.map((r) => {
    const copy = [...r];
    while (copy.length <= Math.max(priceCol, amountCol)) copy.push("");
    return copy;
  });
  if (t.cols.price === undefined) out[t.headerRow][priceCol] = "PU HT";
  if (t.cols.amount === undefined) out[t.headerRow][amountCol] = "Montant HT";
  let total = 0;
  for (const [row, p] of prices) {
    out[row][priceCol] = euros(p.unitCents);
    if (p.quantity) {
      const amount = Math.round(p.unitCents * Number(p.quantity));
      out[row][amountCol] = euros(amount);
      total += amount;
    }
  }
  if (total) {
    const last = Array(out[0].length).fill("");
    last[t.cols.label!] = "Total HT";
    last[amountCol] = euros(total);
    out.push(last);
  }
  return out;
}
