/**
 * Diagnostic énergétique simplifié d'un logement, fait par l'artisan pendant la visite.
 *
 * Il ne remplace ni le DPE ni l'audit réglementaire : il donne un ordre de grandeur de l'étiquette, les travaux les
 * plus utiles, leur coût, l'économie annuelle et les aides indicatives (MaPrimeRénov' barème 2025), pour préparer
 * le devis et la discussion avec le client. Fonctions pures, montants en euros arrondis.
 */

import { z } from "zod";

export const PERIODS = {
  avant_1948: "Avant 1948",
  "1948_1974": "1948 à 1974",
  "1975_1988": "1975 à 1988",
  "1989_2000": "1989 à 2000",
  "2001_2012": "2001 à 2012",
  apres_2012: "Après 2012",
} as const;
export type Period = keyof typeof PERIODS;

/** Besoin de chauffage d'un logement non isolé de la période, en kWh par m² et par an (zone tempérée). */
const BASE_NEED: Record<Period, number> = { avant_1948: 230, "1948_1974": 260, "1975_1988": 190, "1989_2000": 150, "2001_2012": 110, apres_2012: 60 };

export const HEATINGS = {
  fioul: "Chaudière fioul",
  gaz: "Chaudière gaz",
  electrique: "Radiateurs électriques",
  pac: "Pompe à chaleur",
  bois: "Chauffage au bois",
} as const;
export type Heating = keyof typeof HEATINGS;
const EFFICIENCY: Record<Heating, number> = { fioul: 0.8, gaz: 0.85, electrique: 1, pac: 3, bois: 0.75 };
const IS_ELECTRIC: Record<Heating, boolean> = { fioul: false, gaz: false, electrique: true, pac: true, bois: false };
/** Émissions en kg de CO2 par kWh d'énergie finale (méthode du DPE) */
const CO2: Record<Heating, number> = { fioul: 0.324, gaz: 0.227, electrique: 0.079, pac: 0.079, bois: 0.03 };
/** Prix indicatifs 2026 en euros par kWh */
const PRICE: Record<Heating, number> = { fioul: 0.12, gaz: 0.12, electrique: 0.25, pac: 0.25, bois: 0.08 };
/** Coefficient d'énergie primaire de l'électricité dans le DPE depuis le 1er janvier 2026 */
export const ELECTRICITY_PRIMARY = 1.9;

export const INSULATION = { non: "Non isolé", partielle: "Partiellement isolé", bonne: "Bien isolé" } as const;
export type Insulation = keyof typeof INSULATION;
export const WINDOWS = { simple: "Simple vitrage", double_ancien: "Double vitrage ancien", double_recent: "Double vitrage récent" } as const;
export type Windows = keyof typeof WINDOWS;
export const VENTILATION = { aucune: "Aucune", naturelle: "Naturelle (grilles)", vmc_simple: "VMC simple flux", vmc_double: "VMC double flux" } as const;
export type Ventilation = keyof typeof VENTILATION;

/** Part des déperditions par poste, pour un logement non isolé */
const SHARE = { roof: 0.3, walls: 0.25, windows: 0.13, floor: 0.07, air: 0.2 };
const INSULATION_CUT: Record<Insulation, number> = { non: 0, partielle: 0.4, bonne: 0.75 };
const WINDOWS_CUT: Record<Windows, number> = { simple: 0, double_ancien: 0.3, double_recent: 0.6 };
const AIR_CUT: Record<Ventilation, number> = { aucune: 0, naturelle: 0, vmc_simple: 0.15, vmc_double: 0.5 };

export const INCOMES = { tres_modeste: "Très modestes", modeste: "Modestes", intermediaire: "Intermédiaires", superieur: "Supérieurs" } as const;
export type Income = keyof typeof INCOMES;

export const diagnosisSchema = z.object({
  housing: z.enum(["maison", "appartement"]),
  surface: z.coerce.number().min(10, "Surface trop petite").max(1000, "Surface trop grande"),
  period: z.enum(Object.keys(PERIODS) as [Period, ...Period[]]),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Code postal à 5 chiffres"),
  heating: z.enum(Object.keys(HEATINGS) as [Heating, ...Heating[]]),
  roof: z.enum(["non", "partielle", "bonne"]),
  walls: z.enum(["non", "partielle", "bonne"]),
  floor: z.enum(["non", "partielle", "bonne"]),
  windows: z.enum(["simple", "double_ancien", "double_recent"]),
  ventilation: z.enum(["aucune", "naturelle", "vmc_simple", "vmc_double"]),
  householdSize: z.coerce.number().int().min(1).max(12),
  /** Revenu fiscal de référence du foyer, en euros ; vide si inconnu */
  income: z.union([z.literal(""), z.coerce.number().min(0).max(10_000_000)]).optional(),
});
export type DiagnosisInput = z.infer<typeof diagnosisSchema>;

const H1 = new Set(
  "01 02 03 05 08 10 14 15 19 21 23 25 27 28 38 39 42 43 45 51 52 54 55 57 58 59 60 61 62 63 67 68 69 70 71 73 74 75 76 77 78 80 87 88 89 90 91 92 93 94 95".split(
    " ",
  ),
);
const H3 = new Set("06 11 13 20 30 34 66 83".split(" "));
export type Zone = "H1" | "H2" | "H3";
export function climateZone(postalCode: string): Zone {
  const d = postalCode.slice(0, 2);
  return H1.has(d) ? "H1" : H3.has(d) ? "H3" : "H2";
}
const ZONE_FACTOR: Record<Zone, number> = { H1: 1.1, H2: 0.9, H3: 0.6 };

export const isIleDeFrance = (postalCode: string) => ["75", "77", "78", "91", "92", "93", "94", "95"].includes(postalCode.slice(0, 2));

/** Plafonds de revenus MaPrimeRénov' 2025 pour 1 à 5 personnes, puis par personne en plus. */
const CEILINGS: Record<"idf" | "autres", Record<Exclude<Income, "superieur">, number[]>> = {
  autres: {
    tres_modeste: [17173, 25115, 30206, 35285, 40388, 5078],
    modeste: [22015, 32197, 38719, 45234, 51775, 6525],
    intermediaire: [30844, 45340, 54592, 63844, 73098, 9251],
  },
  idf: {
    tres_modeste: [23768, 34884, 41893, 48914, 55961, 7038],
    modeste: [28933, 42463, 51000, 59549, 68123, 8568],
    intermediaire: [40404, 59394, 71060, 83637, 95758, 12122],
  },
};

export function incomeCategory(householdSize: number, income: number, idf: boolean): Income {
  const table = CEILINGS[idf ? "idf" : "autres"];
  const ceiling = (row: number[]) => (householdSize <= 5 ? row[householdSize - 1] : row[4] + row[5] * (householdSize - 5));
  for (const k of ["tres_modeste", "modeste", "intermediaire"] as const) if (income <= ceiling(table[k])) return k;
  return "superieur";
}

export type EnergyClass = "A" | "B" | "C" | "D" | "E" | "F" | "G";
const CLASSES: [EnergyClass, number, number][] = [
  ["A", 70, 6],
  ["B", 110, 11],
  ["C", 180, 30],
  ["D", 250, 50],
  ["E", 330, 70],
  ["F", 420, 100],
];
/** Étiquette à double seuil du DPE : la plus mauvaise des deux (énergie primaire, émissions). */
export function energyClass(primaryKwhM2: number, co2KgM2: number): EnergyClass {
  for (const [c, e, g] of CLASSES) if (primaryKwhM2 <= e && co2KgM2 <= g) return c;
  return "G";
}
const rank = (c: EnergyClass) => "ABCDEFG".indexOf(c);

export interface Performance {
  /** Énergie finale, kWh par m² et par an */
  finalKwhM2: number;
  primaryKwhM2: number;
  co2KgM2: number;
  energyClass: EnergyClass;
  /** Facture annuelle de chauffage et d'eau chaude, en euros */
  yearlyBill: number;
}

type State = Pick<DiagnosisInput, "housing" | "surface" | "period" | "postalCode" | "heating" | "roof" | "walls" | "floor" | "windows" | "ventilation">;

export function performance(s: State): Performance {
  const losses =
    SHARE.roof * (1 - INSULATION_CUT[s.roof]) +
    SHARE.walls * (1 - INSULATION_CUT[s.walls]) +
    SHARE.floor * (1 - INSULATION_CUT[s.floor]) +
    SHARE.windows * (1 - WINDOWS_CUT[s.windows]) +
    SHARE.air * (1 - AIR_CUT[s.ventilation]) +
    0.05;
  const need = BASE_NEED[s.period] * losses * ZONE_FACTOR[climateZone(s.postalCode)] * (s.housing === "appartement" ? 0.8 : 1);
  const hotWater = 20;
  const finalKwhM2 = (need + hotWater) / EFFICIENCY[s.heating];
  const primaryKwhM2 = finalKwhM2 * (IS_ELECTRIC[s.heating] ? ELECTRICITY_PRIMARY : 1);
  const co2KgM2 = finalKwhM2 * CO2[s.heating];
  return {
    finalKwhM2: Math.round(finalKwhM2),
    primaryKwhM2: Math.round(primaryKwhM2),
    co2KgM2: Math.round(co2KgM2),
    energyClass: energyClass(primaryKwhM2, co2KgM2),
    yearlyBill: Math.round(finalKwhM2 * s.surface * PRICE[s.heating]),
  };
}

export type WorkKey = "toiture" | "murs_ext" | "murs_int" | "plancher" | "fenetres" | "vmc" | "pac";

export interface Work {
  key: WorkKey;
  label: string;
  /** Domaine de qualification RGE exigé pour les aides */
  rgeDomain: "isolation_combles" | "isolation_murs" | "isolation_planchers" | "menuiseries" | "ventilation" | "pac";
  quantity: number;
  unit: string;
  costMin: number;
  costMax: number;
  /** Aide MaPrimeRénov' par geste, en euros ; 0 si le geste n'y ouvre pas droit (certificats d'économies d'énergie possibles) */
  aid: number;
  /** Économie annuelle estimée sur la facture si ce seul geste est fait */
  yearlySaving: number;
  /** Étiquette après ce seul geste */
  classAfter: EnergyClass;
}

/** Aide par geste selon la catégorie de revenus : très modestes, modestes, intermédiaires, supérieurs. */
const GESTURE_AID: Record<WorkKey, [number, number, number, number]> = {
  toiture: [25, 20, 15, 0], // par m², rampants et toitures terrasses
  murs_ext: [75, 60, 40, 0], // par m², 100 m² au plus
  murs_int: [25, 20, 15, 0], // par m², 100 m² au plus
  plancher: [0, 0, 0, 0],
  fenetres: [100, 80, 40, 0], // par fenêtre, en remplacement d'un simple vitrage
  vmc: [2500, 2000, 1500, 0],
  pac: [5000, 4000, 3000, 0],
};
const INCOME_INDEX: Record<Income, number> = { tres_modeste: 0, modeste: 1, intermediaire: 2, superieur: 3 };

function candidates(
  s: State,
): {
  key: WorkKey;
  label: string;
  rgeDomain: Work["rgeDomain"];
  quantity: number;
  unit: string;
  unitMin: number;
  unitMax: number;
  after: Partial<State>;
  aidUnits: number;
}[] {
  const out = [];
  const house = s.housing === "maison";
  if (house && s.roof !== "bonne") {
    const q = Math.round(s.surface);
    out.push({
      key: "toiture" as const,
      label: "Isolation des combles ou de la toiture",
      rgeDomain: "isolation_combles" as const,
      quantity: q,
      unit: "m²",
      unitMin: 25,
      unitMax: 60,
      after: { roof: "bonne" as const },
      aidUnits: q,
    });
  }
  if (s.walls !== "bonne") {
    if (house) {
      const q = Math.round(s.surface * 1.1);
      out.push({
        key: "murs_ext" as const,
        label: "Isolation des murs par l'extérieur",
        rgeDomain: "isolation_murs" as const,
        quantity: q,
        unit: "m²",
        unitMin: 140,
        unitMax: 200,
        after: { walls: "bonne" as const },
        aidUnits: Math.min(q, 100),
      });
    } else {
      const q = Math.round(s.surface * 0.6);
      out.push({
        key: "murs_int" as const,
        label: "Isolation des murs par l'intérieur",
        rgeDomain: "isolation_murs" as const,
        quantity: q,
        unit: "m²",
        unitMin: 50,
        unitMax: 90,
        after: { walls: "bonne" as const },
        aidUnits: Math.min(q, 100),
      });
    }
  }
  if (house && s.floor !== "bonne") {
    const q = Math.round(s.surface * 0.8);
    out.push({
      key: "plancher" as const,
      label: "Isolation du plancher bas",
      rgeDomain: "isolation_planchers" as const,
      quantity: q,
      unit: "m²",
      unitMin: 30,
      unitMax: 60,
      after: { floor: "bonne" as const },
      aidUnits: 0,
    });
  }
  if (s.windows !== "double_recent") {
    const q = Math.max(1, Math.round(s.surface / 12));
    out.push({
      key: "fenetres" as const,
      label: "Remplacement des fenêtres",
      rgeDomain: "menuiseries" as const,
      quantity: q,
      unit: "u",
      unitMin: 600,
      unitMax: 1000,
      after: { windows: "double_recent" as const },
      aidUnits: s.windows === "simple" ? q : 0,
    });
  }
  if (s.ventilation === "aucune" || s.ventilation === "naturelle") {
    out.push({
      key: "vmc" as const,
      label: "VMC double flux",
      rgeDomain: "ventilation" as const,
      quantity: 1,
      unit: "forfait",
      unitMin: 4000,
      unitMax: 8000,
      after: { ventilation: "vmc_double" as const },
      aidUnits: 1,
    });
  }
  if (house && s.heating !== "pac" && s.heating !== "bois") {
    out.push({
      key: "pac" as const,
      label: "Pompe à chaleur air/eau",
      rgeDomain: "pac" as const,
      quantity: 1,
      unit: "forfait",
      unitMin: 10000,
      unitMax: 16000,
      after: { heating: "pac" as const },
      aidUnits: 1,
    });
  }
  return out;
}

/** Rénovation d'ampleur : part des dépenses HT prise en charge et plafond de dépenses selon le gain de classes. */
const AMPLEUR_RATE: Record<Income, number> = { tres_modeste: 0.8, modeste: 0.6, intermediaire: 0.45, superieur: 0.3 };
const AMPLEUR_CEILING = (gain: number) => (gain >= 4 ? 70000 : gain === 3 ? 55000 : 40000);

export interface Diagnosis {
  zone: Zone;
  income: Income | null;
  current: Performance;
  works: Work[];
  /** Tous les travaux proposés réalisés ensemble */
  after: Performance;
  classGain: number;
  costMin: number;
  costMax: number;
  gestureAid: number;
  /** Aide de rénovation d'ampleur, si le logement gagne au moins deux classes (accompagnement obligatoire) */
  ampleurAid: number | null;
  /** Meilleure des deux voies */
  bestAid: number;
  remainingMin: number;
  remainingMax: number;
  yearlySaving: number;
  /** Passoire thermique (F ou G) : location interdite à terme */
  sieve: boolean;
}

export function diagnose(input: DiagnosisInput): Diagnosis {
  const current = performance(input);
  const income = input.income === "" || input.income === undefined ? null : incomeCategory(input.householdSize, input.income, isIleDeFrance(input.postalCode));
  const idx = INCOME_INDEX[income ?? "superieur"];
  let all: State = { ...input };
  const works: Work[] = candidates(input)
    .map((c) => {
      const alone = performance({ ...input, ...c.after });
      all = { ...all, ...c.after };
      return {
        key: c.key,
        label: c.label,
        rgeDomain: c.rgeDomain,
        quantity: c.quantity,
        unit: c.unit,
        costMin: Math.round(c.quantity * c.unitMin),
        costMax: Math.round(c.quantity * c.unitMax),
        aid: income ? c.aidUnits * GESTURE_AID[c.key][idx] : 0,
        yearlySaving: Math.max(0, current.yearlyBill - alone.yearlyBill),
        classAfter: alone.energyClass,
      };
    })
    .sort((a, b) => b.yearlySaving / ((b.costMin + b.costMax) / 2) - a.yearlySaving / ((a.costMin + a.costMax) / 2));
  const after = performance(all);
  const classGain = rank(current.energyClass) - rank(after.energyClass);
  const costMin = works.reduce((s, w) => s + w.costMin, 0);
  const costMax = works.reduce((s, w) => s + w.costMax, 0);
  const gestureAid = works.reduce((s, w) => s + w.aid, 0);
  const ampleurOk = income !== null && input.housing === "maison" && classGain >= 2;
  // Les plafonds s'appliquent aux dépenses hors taxes (TVA à 5,5 % sur ces travaux).
  const ampleurAt = (cost: number) => (ampleurOk ? Math.round(Math.min(cost / 1.055, AMPLEUR_CEILING(classGain)) * AMPLEUR_RATE[income!]) : 0);
  const ampleurAid = ampleurOk ? ampleurAt((costMin + costMax) / 2) : null;
  const bestAid = Math.max(gestureAid, ampleurAid ?? 0);
  return {
    zone: climateZone(input.postalCode),
    income,
    current,
    works,
    after,
    classGain,
    costMin,
    costMax,
    gestureAid,
    ampleurAid,
    bestAid,
    remainingMin: Math.max(0, costMin - Math.max(gestureAid, ampleurAt(costMin))),
    remainingMax: Math.max(0, costMax - Math.max(gestureAid, ampleurAt(costMax))),
    yearlySaving: Math.max(0, current.yearlyBill - after.yearlyBill),
    sieve: current.energyClass === "F" || current.energyClass === "G",
  };
}
