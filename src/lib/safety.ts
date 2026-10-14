/**
 * Plan de prévention d'un chantier (fonctions pures) : risques courants du bâtiment avec leurs mesures
 * et équipements de protection, risques suggérés d'après les travaux, repérages obligatoires selon
 * l'âge du bâtiment.
 */

export interface Risk {
  key: string;
  label: string;
  measures: string[];
  ppe: string[];
  /** Mots des intitulés de travaux qui font suggérer ce risque */
  hints: string[];
}

export const RISKS: Risk[] = [
  {
    key: "hauteur",
    label: "Chute de hauteur",
    measures: [
      "Travail depuis un échafaudage monté par une personne formée, ou une plateforme individuelle roulante",
      "Garde-corps en rive de toiture et autour des trémies",
      "Échelle réservée à l'accès, jamais comme poste de travail",
    ],
    ppe: ["Harnais antichute si une protection collective est impossible", "Casque"],
    hints: [
      "toiture",
      "toit",
      "couverture",
      "charpente",
      "zinguerie",
      "gouttière",
      "façade",
      "ravalement",
      "échafaudage",
      "faîtage",
      "velux",
      "fenêtre de toit",
    ],
  },
  {
    key: "chute_plainpied",
    label: "Chute de plain-pied et encombrement",
    measures: ["Zone de travail rangée chaque soir", "Câbles et tuyaux regroupés hors des passages", "Éclairage suffisant des circulations"],
    ppe: ["Chaussures de sécurité"],
    hints: [],
  },
  {
    key: "manutention",
    label: "Manutention et postures",
    measures: [
      "Aides mécaniques pour les charges lourdes (diable, lève-plaque)",
      "Port à deux au-delà de 25 kg",
      "Livraisons au plus près du poste de travail",
    ],
    ppe: ["Gants de manutention", "Genouillères pour les travaux au sol"],
    hints: ["carrelage", "plaque", "placo", "plâtre", "parquet", "sol", "chape", "dalle", "faïence", "bloc", "parpaing"],
  },
  {
    key: "poussieres",
    label: "Poussières de silice et de bois",
    measures: ["Découpe à l'eau ou outils avec aspiration intégrée", "Aspirateur de classe M ou H, pas de balayage à sec", "Aération du local"],
    ppe: ["Masque FFP3 pendant les découpes et le ponçage", "Lunettes de protection"],
    hints: ["découpe", "ponçage", "démolition", "saignée", "rainurage", "carottage", "béton", "carrelage", "plâtre", "bois", "parquet"],
  },
  {
    key: "amiante",
    label: "Amiante",
    measures: [
      "Repérage amiante avant travaux demandé au donneur d'ordre et consulté avant toute intervention",
      "En cas de matériau amianté : arrêt et intervention d'une entreprise certifiée (sous-section 3) ou formée (sous-section 4)",
    ],
    ppe: ["Équipements prévus par le mode opératoire amiante de l'entreprise"],
    hints: ["démolition", "dépose", "désamiantage", "flocage", "fibrociment", "dalle vinyle", "ancien"],
  },
  {
    key: "plomb",
    label: "Plomb dans les peintures",
    measures: [
      "Constat de risque d'exposition au plomb consulté",
      "Décapage chimique ou par voie humide, jamais au chalumeau ni ponçage à sec",
      "Nettoyage humide en fin de journée",
    ],
    ppe: ["Masque FFP3", "Combinaison jetable", "Gants"],
    hints: ["décapage", "peinture ancienne", "menuiserie ancienne"],
  },
  {
    key: "electrique",
    label: "Risque électrique",
    measures: [
      "Consignation du circuit avant intervention et vérification d'absence de tension",
      "Intervenant habilité pour les travaux électriques",
      "Coffret de chantier avec différentiel 30 mA",
    ],
    ppe: ["Gants isolants et outils isolés pour les travaux électriques"],
    hints: ["électricité", "électrique", "tableau", "prise", "éclairage", "câblage", "luminaire", "domotique"],
  },
  {
    key: "chimique",
    label: "Produits chimiques (colles, solvants, résines)",
    measures: [
      "Fiches de données de sécurité disponibles sur le chantier",
      "Local aéré pendant l'application et le séchage",
      "Produits stockés fermés, hors de portée des occupants",
    ],
    ppe: ["Gants nitrile", "Lunettes", "Masque à cartouche A2 pour les solvants"],
    hints: ["peinture", "vernis", "colle", "résine", "étanchéité", "lasure", "traitement", "époxy", "mastic"],
  },
  {
    key: "bruit",
    label: "Bruit et vibrations",
    measures: ["Outils récents et entretenus", "Alternance des tâches bruyantes", "Prévenir les occupants des périodes bruyantes"],
    ppe: ["Protections auditives", "Gants anti-vibrations pour le marteau-piqueur"],
    hints: ["démolition", "marteau", "perforateur", "carottage", "saignée", "burinage"],
  },
  {
    key: "coupure",
    label: "Coupures et projections",
    measures: ["Outils de coupe avec protecteurs en place", "Lames changées dès qu'elles sont usées"],
    ppe: ["Gants anticoupure", "Lunettes de protection"],
    hints: ["découpe", "meuleuse", "scie", "verre", "vitrage", "tôle"],
  },
  {
    key: "feu",
    label: "Incendie et travaux par point chaud",
    measures: ["Permis de feu pour la soudure et le chalumeau", "Extincteur à portée de main", "Surveillance une heure après la fin du point chaud"],
    ppe: ["Gants et lunettes de soudage"],
    hints: ["soudure", "brasure", "chalumeau", "étanchéité bitume", "membrane"],
  },
  {
    key: "tranchee",
    label: "Fouilles et tranchées",
    measures: [
      "Blindage des fouilles de plus de 1,30 m",
      "Déclaration de travaux auprès des exploitants de réseaux (DT-DICT)",
      "Balisage et éloignement des engins du bord",
    ],
    ppe: ["Casque", "Gilet haute visibilité"],
    hints: ["tranchée", "terrassement", "fouille", "fondation", "assainissement", "réseau enterré", "raccordement"],
  },
  {
    key: "coactivite",
    label: "Coactivité avec d'autres entreprises ou les occupants",
    measures: ["Planning partagé avec les autres intervenants", "Zones de travail délimitées et signalées", "Occupants informés des zones interdites"],
    ppe: [],
    hints: [],
  },
];

export const RISK_KEYS = RISKS.map((r) => r.key);
export const riskByKey = (key: string) => RISKS.find((r) => r.key === key);

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Risques à proposer d'après les intitulés des travaux, la présence d'autres entreprises et l'âge du bâtiment. */
export function suggestRisks(input: { labels: readonly string[]; buildingYear: number | null; otherCompanies: boolean }): string[] {
  const text = norm(input.labels.join(" \n "));
  const keys = new Set<string>(["chute_plainpied", "manutention"]);
  for (const r of RISKS) if (r.hints.some((h) => text.includes(norm(h)))) keys.add(r.key);
  if (input.buildingYear && input.buildingYear < 1997 && (keys.has("poussieres") || keys.has("bruit"))) keys.add("amiante");
  if (input.buildingYear && input.buildingYear < 1949 && keys.has("chimique")) keys.add("plomb");
  // Bâtiment récent : ni amiante (interdit depuis 1997) ni peintures au plomb (interdites depuis 1949).
  if (input.buildingYear && input.buildingYear >= 1997) keys.delete("amiante");
  if (input.buildingYear && input.buildingYear >= 1949) keys.delete("plomb");
  if (input.otherCompanies) keys.add("coactivite");
  return RISK_KEYS.filter((k) => keys.has(k));
}

/** Repérages et documents à obtenir avant de commencer, selon l'âge du bâtiment. */
export function requiredSurveys(buildingYear: number | null): string[] {
  const out: string[] = [];
  if (buildingYear && buildingYear < 1997) out.push("Repérage amiante avant travaux (permis de construire délivré avant le 1er juillet 1997)");
  if (buildingYear && buildingYear < 1949) out.push("Constat de risque d'exposition au plomb (bâtiment construit avant 1949)");
  return out;
}

/** Équipements de protection à prévoir, sans doublon, toujours avec les chaussures de sécurité. */
export function protectiveEquipment(keys: readonly string[]): string[] {
  const out = new Set<string>(["Chaussures de sécurité"]);
  for (const k of keys) for (const p of riskByKey(k)?.ppe ?? []) out.add(p);
  return [...out];
}

export const EMERGENCY_NUMBERS = [
  { label: "Samu", number: "15" },
  { label: "Pompiers", number: "18" },
  { label: "Numéro d'urgence européen", number: "112" },
];
