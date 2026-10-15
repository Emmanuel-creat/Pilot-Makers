/**
 * Bilan matière d'un chantier : ce qui a été commandé, rendu au fournisseur, laissé en reste, et donc réellement
 * posé. Un surplus élevé signale des quantités commandées trop larges ; chaque reste a un devenir (stock, réemploi
 * par un confrère, déchet). Fonctions pures, quantités en millièmes, montants en centimes.
 */

export const FATES = { stock: "Gardé en stock", reemploi: "Proposé au réemploi", dechet: "Jeté" } as const;
export type Fate = keyof typeof FATES;

/** Au-delà de ce surplus (en points de base, 1000 = 10 %), la commande est jugée trop large */
export const SURPLUS_ALERT_BP = 1000;

export interface OrderedLine {
  id: string;
  label: string;
  unit: string;
  orderedMilli: number;
  receivedMilli: number;
  unitCostCents: number;
}

export interface Leftover {
  id: string;
  orderLineId: string | null;
  label: string;
  unit: string;
  quantityMilli: number;
  unitCostCents: number;
  fate: Fate;
}

export interface MaterialRow {
  key: string;
  label: string;
  unit: string;
  receivedMilli: number;
  returnedMilli: number;
  leftoverMilli: number;
  usedMilli: number;
  /** Surplus (rendu et reste) rapporté au reçu, en points de base */
  surplusBp: number;
  surplusCents: number;
}

const keyOf = (label: string, unit: string) => `${label.trim().toLowerCase().replace(/\s+/g, " ")}|${unit.trim().toLowerCase()}`;

/** Lignes du bilan, regroupées par matériau (même désignation, même unité) */
export function materialBalance(lines: readonly OrderedLine[], returnsByLine: ReadonlyMap<string, number>, leftovers: readonly Leftover[]) {
  const rows = new Map<string, MaterialRow & { costMilliCents: number }>();
  const lineKey = new Map<string, string>();
  const get = (label: string, unit: string) => {
    const k = keyOf(label, unit);
    if (!rows.has(k))
      rows.set(k, {
        key: k,
        label: label.trim(),
        unit,
        receivedMilli: 0,
        returnedMilli: 0,
        leftoverMilli: 0,
        usedMilli: 0,
        surplusBp: 0,
        surplusCents: 0,
        costMilliCents: 0,
      });
    return rows.get(k)!;
  };
  for (const l of lines) {
    const r = get(l.label, l.unit);
    const received = l.receivedMilli || l.orderedMilli;
    r.receivedMilli += received;
    r.returnedMilli += returnsByLine.get(l.id) ?? 0;
    r.costMilliCents += received * l.unitCostCents;
    lineKey.set(l.id, r.key);
  }
  let leftoverCents = 0;
  for (const o of leftovers) {
    const k = (o.orderLineId && lineKey.get(o.orderLineId)) || keyOf(o.label, o.unit);
    const r = rows.get(k) ?? get(o.label, o.unit);
    r.leftoverMilli += o.quantityMilli;
    leftoverCents += Math.round((o.quantityMilli * o.unitCostCents) / 1000);
  }
  const out: MaterialRow[] = [...rows.values()].map(({ costMilliCents, ...r }) => {
    const surplus = r.returnedMilli + r.leftoverMilli;
    const unitCost = r.receivedMilli ? costMilliCents / r.receivedMilli : 0;
    return {
      ...r,
      usedMilli: Math.max(0, r.receivedMilli - surplus),
      surplusBp: r.receivedMilli ? Math.round((surplus * 10000) / r.receivedMilli) : 0,
      surplusCents: Math.round((surplus * unitCost) / 1000),
    };
  });
  out.sort((a, b) => b.surplusCents - a.surplusCents || a.label.localeCompare(b.label, "fr"));
  const byFate = (f: Fate) => leftovers.filter((o) => o.fate === f).reduce((s, o) => s + Math.round((o.quantityMilli * o.unitCostCents) / 1000), 0);
  return {
    rows: out,
    overOrdered: out.filter((r) => r.surplusBp > SURPLUS_ALERT_BP).map((r) => r.label),
    leftoverCents,
    fates: { stock: byFate("stock"), reemploi: byFate("reemploi"), dechet: byFate("dechet") },
  };
}

/** Quantité en millièmes à partir d'une saisie (« 2,5 ») */
export function parseQuantity(v: string): number {
  const t = v.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(?:\.\d{1,3})?$/.test(t)) throw new Error("Quantité invalide");
  const n = Math.round(Number(t) * 1000);
  if (n <= 0) throw new Error("Quantité invalide");
  return n;
}

export const formatQuantity = (milli: number) => (milli / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 });
