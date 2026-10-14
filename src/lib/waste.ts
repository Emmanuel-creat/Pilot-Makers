/**
 * Déchets de chantier (fonctions pures) : catégories, bordereaux exigés, bilan d'un chantier et
 * lignes du registre chronologique des déchets sortants que l'entreprise doit tenir.
 */

export type WasteClass = "inerte" | "non_dangereux" | "dangereux";

export interface WasteCategory {
  key: string;
  label: string;
  cls: WasteClass;
  /** Code de la nomenclature européenne des déchets */
  code: string;
  /** Bordereau exigé pour l'enlèvement : BSDA pour l'amiante, BSDD pour les autres déchets dangereux */
  slip: "" | "BSDD" | "BSDA";
}

export const WASTE_CATEGORIES: WasteCategory[] = [
  { key: "gravats", label: "Gravats, béton, briques, tuiles", cls: "inerte", code: "17 01 07", slip: "" },
  { key: "terres", label: "Terres et cailloux", cls: "inerte", code: "17 05 04", slip: "" },
  { key: "verre", label: "Verre", cls: "inerte", code: "17 02 02", slip: "" },
  { key: "bois", label: "Bois non traité", cls: "non_dangereux", code: "17 02 01", slip: "" },
  { key: "platre", label: "Plâtre et plaques de plâtre", cls: "non_dangereux", code: "17 08 02", slip: "" },
  { key: "metaux", label: "Métaux", cls: "non_dangereux", code: "17 04 07", slip: "" },
  { key: "plastiques", label: "Plastiques et emballages", cls: "non_dangereux", code: "17 02 03", slip: "" },
  { key: "isolants", label: "Isolants (laines minérales, polystyrène)", cls: "non_dangereux", code: "17 06 04", slip: "" },
  { key: "melange", label: "Déchets non dangereux en mélange", cls: "non_dangereux", code: "17 09 04", slip: "" },
  { key: "bois_traite", label: "Bois traité", cls: "dangereux", code: "17 02 04*", slip: "BSDD" },
  { key: "peintures", label: "Peintures, colles, solvants et leurs emballages", cls: "dangereux", code: "08 01 11*", slip: "BSDD" },
  { key: "amiante", label: "Matériaux contenant de l'amiante", cls: "dangereux", code: "17 06 05*", slip: "BSDA" },
];

export const WASTE_UNITS = { t: "tonne", m3: "m³", kg: "kg" } as const;
export type WasteUnit = keyof typeof WASTE_UNITS;
export const WASTE_CLASSES: Record<WasteClass, string> = { inerte: "Inertes", non_dangereux: "Non dangereux", dangereux: "Dangereux" };

export const categoryByKey = (key: string) => WASTE_CATEGORIES.find((c) => c.key === key);

export interface WasteEntry {
  id: string;
  date: string;
  category: string;
  quantity: number;
  unit: WasteUnit;
  destination: string;
  carrier: string;
  slipRef: string;
  sorted: boolean;
  costCents: number;
}

/** Ce qui manque à une évacuation : le bordereau pour un déchet dangereux, l'installation de destination toujours. */
export function entryIssues(e: Pick<WasteEntry, "category" | "slipRef" | "destination">): string[] {
  const c = categoryByKey(e.category);
  const out: string[] = [];
  if (!e.destination.trim()) out.push("Installation de destination à indiquer");
  if (c?.slip && !e.slipRef.trim()) out.push(`Numéro de ${c.slip} à indiquer`);
  return out;
}

/** Quantité en tonnes quand l'unité le permet, pour additionner les évacuations. */
export function tonnes(e: Pick<WasteEntry, "quantity" | "unit">): number | null {
  return e.unit === "t" ? e.quantity : e.unit === "kg" ? e.quantity / 1000 : null;
}

export interface WasteSummary {
  byClass: { cls: WasteClass; label: string; tonnes: number; volumeM3: number }[];
  sortedShare: number | null;
  costCents: number;
  missing: number;
}

export function wasteSummary(entries: readonly WasteEntry[]): WasteSummary {
  const byClass = (Object.keys(WASTE_CLASSES) as WasteClass[]).map((cls) => {
    const list = entries.filter((e) => categoryByKey(e.category)?.cls === cls);
    return {
      cls,
      label: WASTE_CLASSES[cls],
      tonnes: Math.round(list.reduce((s, e) => s + (tonnes(e) ?? 0), 0) * 1000) / 1000,
      volumeM3: Math.round(list.reduce((s, e) => s + (e.unit === "m3" ? e.quantity : 0), 0) * 100) / 100,
    };
  });
  return {
    byClass: byClass.filter((c) => c.tonnes || c.volumeM3),
    sortedShare: entries.length ? Math.round((entries.filter((e) => e.sorted).length / entries.length) * 100) : null,
    costCents: entries.reduce((s, e) => s + e.costCents, 0),
    missing: entries.filter((e) => entryIssues(e).length).length,
  };
}

/** En-têtes du registre chronologique des déchets sortants (arrêté du 31 mai 2021). */
export const REGISTER_HEADERS = [
  "Date d'expédition",
  "Chantier",
  "Adresse du chantier",
  "Code déchet",
  "Dénomination",
  "Quantité",
  "Unité",
  "Dangereux",
  "Installation de destination",
  "Transporteur",
  "Numéro de bordereau",
  "Tri à la source",
];

export function registerRow(e: WasteEntry, job: { title: string; address: string }): string[] {
  const c = categoryByKey(e.category);
  return [
    e.date,
    job.title,
    job.address,
    c?.code ?? "",
    c?.label ?? e.category,
    e.quantity.toLocaleString("fr-FR", { maximumFractionDigits: 3 }),
    WASTE_UNITS[e.unit],
    c?.cls === "dangereux" ? "oui" : "non",
    e.destination,
    e.carrier,
    e.slipRef,
    e.sorted ? "oui" : "non",
  ];
}
