/**
 * Commandes groupées (fonctions pures) : les lignes de plusieurs commandes d'un même fournisseur
 * réunies en une seule, quantités additionnées article par article, avec la part de chaque chantier.
 */

export interface GroupSourceLine {
  label: string;
  reference: string;
  unit: string;
  quantityMilli: number;
  unitCostCents: number;
}

export interface GroupSource {
  orderNumber: string;
  jobTitle: string;
  lines: GroupSourceLine[];
}

export interface MergedLine {
  label: string;
  reference: string;
  unit: string;
  quantityMilli: number;
  unitCostCents: number;
  totalCents: number;
  split: { jobTitle: string; orderNumber: string; quantityMilli: number }[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Même article : même référence si elle existe, sinon même désignation, et même unité et même prix. */
export function lineKey(l: GroupSourceLine): string {
  return [l.reference.trim() ? `ref:${norm(l.reference)}` : `lib:${norm(l.label)}`, norm(l.unit), l.unitCostCents].join("|");
}

export function mergeLines(sources: readonly GroupSource[]): MergedLine[] {
  const out = new Map<string, MergedLine>();
  for (const s of sources) {
    for (const l of s.lines) {
      const k = lineKey(l);
      const m = out.get(k) ?? {
        label: l.label,
        reference: l.reference,
        unit: l.unit,
        quantityMilli: 0,
        unitCostCents: l.unitCostCents,
        totalCents: 0,
        split: [],
      };
      m.quantityMilli += l.quantityMilli;
      m.split.push({ jobTitle: s.jobTitle, orderNumber: s.orderNumber, quantityMilli: l.quantityMilli });
      m.totalCents = Math.round((m.quantityMilli * m.unitCostCents) / 1000);
      out.set(k, m);
    }
  }
  return [...out.values()];
}

export const supplierKey = (s: string) => norm(s);

export function milliText(milli: number): string {
  return (milli / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 });
}
