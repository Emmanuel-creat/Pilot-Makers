/**
 * Empreinte carbone (fonctions pures) : facteurs par unité, en grammes d'équivalent CO2, et bilan d'un devis.
 *
 * Les valeurs par défaut sont des ordres de grandeur indicatifs pour les produits courants du bâtiment, à
 * remplacer par la valeur de la fiche environnementale du fabricant (FDES ou PEP) quand on la connaît.
 */

import { words } from "./similar-quotes";

export const CARBON_SOURCES = {
  fdes: "Fiche FDES ou PEP du fabricant",
  base: "Base de données publique",
  fournisseur: "Donnée du fournisseur",
  indicatif: "Ordre de grandeur indicatif",
} as const;
export type CarbonSource = keyof typeof CARBON_SOURCES;

interface DefaultFactor {
  /** Mots qui doivent tous figurer dans la désignation (sans accents) */
  match: string[];
  /** Unités acceptées, en minuscules */
  units: string[];
  /** Grammes de CO2e par unité */
  grams: number;
  label: string;
}

const M2 = ["m2", "m²"];
const U = ["u", "unite", "unité", "pce", "piece", "pièce", "ens", "ensemble"];
const ML = ["ml", "m"];

/** Ordres de grandeur indicatifs, du plus précis au plus général : le premier qui correspond s'applique. */
export const DEFAULT_FACTORS: DefaultFactor[] = [
  { match: ["pompe", "chaleur"], units: U, grams: 800_000, label: "Pompe à chaleur" },
  { match: ["chaudiere"], units: U, grams: 300_000, label: "Chaudière" },
  { match: ["chauffe"], units: U, grams: 150_000, label: "Chauffe-eau" },
  { match: ["fenetre", "alu"], units: U, grams: 200_000, label: "Fenêtre aluminium" },
  { match: ["fenetre", "bois"], units: U, grams: 60_000, label: "Fenêtre bois" },
  { match: ["fenetre"], units: U, grams: 100_000, label: "Fenêtre PVC" },
  { match: ["porte"], units: U, grams: 80_000, label: "Porte" },
  { match: ["baignoire"], units: U, grams: 100_000, label: "Baignoire" },
  { match: ["receveur"], units: U, grams: 40_000, label: "Receveur de douche" },
  { match: ["radiateur"], units: U, grams: 50_000, label: "Radiateur" },
  { match: ["lavabo"], units: U, grams: 30_000, label: "Lavabo" },
  { match: ["vasque"], units: U, grams: 30_000, label: "Vasque" },
  { match: ["cuvette"], units: U, grams: 50_000, label: "WC" },
  { match: ["carrelage"], units: M2, grams: 15_000, label: "Carrelage" },
  { match: ["faience"], units: M2, grams: 15_000, label: "Faïence" },
  { match: ["parquet"], units: M2, grams: 10_000, label: "Parquet" },
  { match: ["tuile"], units: M2, grams: 20_000, label: "Tuiles" },
  { match: ["ardoise"], units: M2, grams: 10_000, label: "Ardoises" },
  { match: ["laine", "roche"], units: M2, grams: 4_000, label: "Laine de roche" },
  { match: ["laine", "verre"], units: M2, grams: 2_000, label: "Laine de verre" },
  { match: ["polystyrene"], units: M2, grams: 8_000, label: "Polystyrène" },
  { match: ["platre"], units: M2, grams: 3_000, label: "Plaque de plâtre" },
  { match: ["peinture"], units: M2, grams: 500, label: "Peinture (par m² peint)" },
  { match: ["peinture"], units: ["l", "litre", "litres"], grams: 2_500, label: "Peinture (par litre)" },
  { match: ["beton"], units: ["m3", "m³"], grams: 250_000, label: "Béton" },
  { match: ["ciment"], units: ["kg"], grams: 800, label: "Ciment" },
  { match: ["acier"], units: ["kg"], grams: 2_000, label: "Acier" },
  { match: ["cuivre"], units: ML, grams: 1_000, label: "Tube cuivre" },
  { match: ["tube"], units: ML, grams: 800, label: "Tube PVC" },
];

const UNIT_ALIAS: Record<string, string> = { "m^2": "m2", "m^3": "m3" };
const normUnit = (u: string) => {
  const x = u.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIAS[x] ?? x;
};

/** Facteur indicatif pour une désignation et une unité, ou null. */
export function defaultFactor(label: string, unit: string): DefaultFactor | null {
  const w = new Set(words(label));
  const u = normUnit(unit);
  return DEFAULT_FACTORS.find((f) => f.units.includes(u) && f.match.every((m) => w.has(m) || [...w].some((x) => x.startsWith(m)))) ?? null;
}

export interface CarbonLine {
  label: string;
  unit: string;
  quantityMilli: number;
  nature: string;
  /** Facteur de l'article du catalogue, en grammes par unité */
  itemGrams: number | null;
}

export type CarbonOrigin = "catalogue" | "indicatif" | "inconnue" | "sans_objet";

export function lineCarbon(l: CarbonLine): { grams: number; origin: CarbonOrigin; factorGrams: number | null } {
  if (l.itemGrams != null) return { grams: Math.round((l.itemGrams * l.quantityMilli) / 1000), origin: "catalogue", factorGrams: l.itemGrams };
  // La main-d'oeuvre et les déplacements sont hors du bilan des produits.
  if (l.nature === "main_oeuvre" || l.nature === "deplacement") return { grams: 0, origin: "sans_objet", factorGrams: null };
  const f = defaultFactor(l.label, l.unit);
  if (f) return { grams: Math.round((f.grams * l.quantityMilli) / 1000), origin: "indicatif", factorGrams: f.grams };
  return { grams: 0, origin: "inconnue", factorGrams: null };
}

export function quoteCarbonBalance(lines: CarbonLine[]) {
  const detail = lines.map((l) => ({ label: l.label, unit: l.unit, ...lineCarbon(l) }));
  const grams = detail.reduce((a, d) => a + d.grams, 0);
  const estimated = detail.filter((d) => d.origin === "indicatif").reduce((a, d) => a + d.grams, 0);
  return {
    grams,
    estimatedGrams: estimated,
    top: detail
      .filter((d) => d.grams > 0)
      .sort((a, b) => b.grams - a.grams)
      .slice(0, 5)
      .map((d) => ({ ...d, shareBp: grams ? Math.round((d.grams * 10000) / grams) : 0 })),
    unknown: detail.filter((d) => d.origin === "inconnue").map((d) => d.label),
    covered: detail.filter((d) => d.origin === "catalogue" || d.origin === "indicatif").length,
    products: detail.filter((d) => d.origin !== "sans_objet").length,
  };
}

/** Grammes affichés en kilogrammes ou en tonnes. */
export function formatCarbon(grams: number) {
  if (grams >= 1_000_000) return `${(grams / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} t CO2e`;
  return `${(grams / 1000).toLocaleString("fr-FR", { maximumFractionDigits: grams < 10_000 ? 1 : 0 })} kg CO2e`;
}
