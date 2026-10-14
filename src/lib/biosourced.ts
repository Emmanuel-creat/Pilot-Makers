/**
 * Alternatives biosourcées (fonctions pures) : pour un produit courant du devis, des matériaux
 * d'origine végétale ou animale qui rendent le même service, avec leur cycle de vie comparé.
 *
 * Les valeurs sont des ordres de grandeur indicatifs (fabrication, durée de vie, fin de vie), à
 * confirmer par la fiche FDES du produit retenu. La comparaison se fait sur 50 ans, durée de
 * référence des bâtiments : un produit à remplacer deux fois compte deux fois.
 */

import { defaultFactor } from "./carbon";
import { words } from "./similar-quotes";

export const REFERENCE_YEARS = 50;

export interface Alternative {
  id: string;
  label: string;
  /** Grammes de CO2e par unité pour la fabrication */
  grams: number;
  /** Carbone d'origine biologique stocké dans le produit, en grammes de CO2 par unité */
  storedGrams: number;
  lifespanYears: number;
  endOfLife: string;
  /** Écart de prix indicatif sur la fourniture, en % (positif : plus cher) */
  costDeltaPercent: number;
  /** Point d'attention de mise en œuvre */
  note: string;
}

interface Rule {
  /** Mots qui doivent tous figurer dans la désignation (sans accents) */
  match: string[];
  units: string[];
  conventional: { label: string; grams: number; lifespanYears: number; endOfLife: string };
  alternatives: Alternative[];
}

const M2 = ["m2", "m²"];
const U = ["u", "unite", "unité", "pce", "piece", "pièce", "ens", "ensemble"];
const L = ["l", "litre", "litres"];

const FIBRE_BOIS: Alternative = {
  id: "fibre-bois",
  label: "Fibre de bois (même résistance thermique)",
  grams: 3_000,
  storedGrams: 9_000,
  lifespanYears: 50,
  endOfLife: "Réemploi ou compostage, sans déchet dangereux",
  costDeltaPercent: 40,
  note: "Meilleur confort d'été grâce à son inertie ; épaisseur un peu plus forte à résistance égale.",
};
const OUATE: Alternative = {
  id: "ouate-cellulose",
  label: "Ouate de cellulose soufflée",
  grams: 600,
  storedGrams: 2_500,
  lifespanYears: 50,
  endOfLife: "Recyclable, issue de papier recyclé",
  costDeltaPercent: -10,
  note: "Idéale en combles perdus ; prévoir un tassement de 15 à 20 % dans l'épaisseur soufflée.",
};
const CHANVRE: Alternative = {
  id: "laine-chanvre",
  label: "Laine de chanvre",
  grams: 1_500,
  storedGrams: 3_500,
  lifespanYears: 50,
  endOfLife: "Compostable ou valorisable en énergie",
  costDeltaPercent: 30,
  note: "Régule l'humidité ; se découpe à la scie égoïne.",
};
const LIEGE: Alternative = {
  id: "liege",
  label: "Panneau de liège expansé",
  grams: 2_500,
  storedGrams: 8_000,
  lifespanYears: 50,
  endOfLife: "Réemploi ou broyage en granulats",
  costDeltaPercent: 120,
  note: "Imputrescible, convient aux parois enterrées et à l'isolation extérieure.",
};

const RULES: Rule[] = [
  {
    match: ["laine", "verre"],
    units: M2,
    conventional: { label: "Laine de verre", grams: 2_000, lifespanYears: 50, endOfLife: "Enfouissement le plus souvent" },
    alternatives: [FIBRE_BOIS, OUATE, CHANVRE],
  },
  {
    match: ["laine", "roche"],
    units: M2,
    conventional: { label: "Laine de roche", grams: 4_000, lifespanYears: 50, endOfLife: "Enfouissement le plus souvent" },
    alternatives: [FIBRE_BOIS, CHANVRE],
  },
  {
    match: ["polystyrene"],
    units: M2,
    conventional: { label: "Polystyrène", grams: 8_000, lifespanYears: 50, endOfLife: "Incinération ou enfouissement" },
    alternatives: [LIEGE, { ...FIBRE_BOIS, id: "fibre-bois-rigide", label: "Panneau rigide de fibre de bois", grams: 4_000, storedGrams: 12_000 }],
  },
  {
    match: ["fenetre"],
    units: U,
    conventional: { label: "Fenêtre PVC", grams: 100_000, lifespanYears: 30, endOfLife: "Recyclage partiel du PVC" },
    alternatives: [
      {
        id: "fenetre-bois",
        label: "Fenêtre bois issu de forêts gérées durablement",
        grams: 60_000,
        storedGrams: 40_000,
        lifespanYears: 50,
        endOfLife: "Valorisation du bois, recyclage du vitrage",
        costDeltaPercent: 25,
        note: "Lasure à refaire tous les 8 à 10 ans, ou finition usine plus durable.",
      },
    ],
  },
  {
    match: ["peinture"],
    units: [...M2, ...L],
    conventional: { label: "Peinture acrylique", grams: 500, lifespanYears: 10, endOfLife: "Déchet dangereux pour les restes de pots" },
    alternatives: [
      {
        id: "peinture-biosourcee",
        label: "Peinture biosourcée (huiles végétales, caséine, chaux)",
        grams: 250,
        storedGrams: 0,
        lifespanYears: 10,
        endOfLife: "Restes non dangereux, pots recyclables",
        costDeltaPercent: 35,
        note: "Choisir un produit étiqueté A+ ; temps de séchage plus long pour les finitions à l'huile.",
      },
    ],
  },
  {
    match: ["parquet"],
    units: M2,
    conventional: { label: "Revêtement stratifié", grams: 10_000, lifespanYears: 15, endOfLife: "Enfouissement ou incinération" },
    alternatives: [
      {
        id: "parquet-massif",
        label: "Parquet massif de bois local",
        grams: 6_000,
        storedGrams: 15_000,
        lifespanYears: 50,
        endOfLife: "Ponçable plusieurs fois, réemploi possible",
        costDeltaPercent: 60,
        note: "Prévoir l'acclimatation des lames 48 heures dans la pièce avant la pose.",
      },
    ],
  },
  {
    match: ["enduit"],
    units: M2,
    conventional: { label: "Enduit ciment", grams: 6_000, lifespanYears: 30, endOfLife: "Gravats inertes" },
    alternatives: [
      {
        id: "chaux-chanvre",
        label: "Enduit chaux et chanvre",
        grams: 4_000,
        storedGrams: 3_000,
        lifespanYears: 40,
        endOfLife: "Gravats inertes, sans déchet dangereux",
        costDeltaPercent: 20,
        note: "Laisse respirer les murs anciens ; mise en œuvre en plusieurs passes.",
      },
    ],
  },
  {
    match: ["sol", "vinyle"],
    units: M2,
    conventional: { label: "Sol vinyle", grams: 8_000, lifespanYears: 15, endOfLife: "Incinération ou enfouissement" },
    alternatives: [
      {
        id: "linoleum",
        label: "Linoléum naturel (huile de lin, farine de bois, jute)",
        grams: 4_000,
        storedGrams: 2_000,
        lifespanYears: 25,
        endOfLife: "Valorisable en énergie, sans chlore",
        costDeltaPercent: 15,
        note: "Ragréage soigné indispensable ; jaunissement temporaire à l'abri de la lumière.",
      },
    ],
  },
];

const BIOSOURCED_WORDS = ["chanvre", "bois", "liege", "ouate", "linoleum", "biosourcee", "lin", "chaux"];

function ruleFor(label: string, unit: string): Rule | null {
  const w = new Set(words(label));
  // La désignation décrit déjà un matériau biosourcé.
  if (BIOSOURCED_WORDS.some((b) => w.has(b))) return null;
  const u = unit.trim().toLowerCase();
  return RULES.find((r) => r.units.includes(u) && r.match.every((m) => w.has(m) || [...w].some((x) => x.startsWith(m)))) ?? null;
}

/** Émissions sur 50 ans pour une quantité donnée : fabrication répétée à chaque remplacement. */
export function lifecycleGrams(gramsPerUnit: number, lifespanYears: number, quantity: number): number {
  return Math.round(gramsPerUnit * Math.ceil(REFERENCE_YEARS / Math.max(lifespanYears, 1)) * quantity);
}

export interface LineAlternatives {
  label: string;
  unit: string;
  quantity: number;
  conventional: { label: string; lifecycleGrams: number; lifespanYears: number; endOfLife: string };
  alternatives: (Alternative & { lifecycleGrams: number; savedGrams: number; storedTotalGrams: number })[];
}

/** Alternatives d'une ligne du devis, triées par gain sur le cycle de vie ; null si aucune ne s'applique. */
export function alternativesFor(label: string, unit: string, quantity: number, itemGrams: number | null = null): LineAlternatives | null {
  const rule = ruleFor(label, unit);
  if (!rule || quantity <= 0) return null;
  const base = itemGrams ?? defaultFactor(label, unit)?.grams ?? rule.conventional.grams;
  const conv = lifecycleGrams(base, rule.conventional.lifespanYears, quantity);
  return {
    label,
    unit,
    quantity,
    conventional: {
      label: rule.conventional.label,
      lifecycleGrams: conv,
      lifespanYears: rule.conventional.lifespanYears,
      endOfLife: rule.conventional.endOfLife,
    },
    alternatives: rule.alternatives
      .map((a) => {
        const lc = lifecycleGrams(a.grams, a.lifespanYears, quantity);
        return { ...a, lifecycleGrams: lc, savedGrams: conv - lc, storedTotalGrams: Math.round(a.storedGrams * quantity) };
      })
      .sort((x, y) => y.savedGrams - x.savedGrams),
  };
}

export function findAlternative(id: string): Alternative | null {
  for (const r of RULES) for (const a of r.alternatives) if (a.id === id) return a;
  return null;
}
