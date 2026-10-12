/**
 * Bibliothèques de prestations fournies par le logiciel.
 *
 * Les prix sont des valeurs de départ INDICATIVES destinées à être remplacées
 * par les tarifs de l'artisan. Ils ne constituent pas des prix de marché.
 */

import type { ItemInput } from "./services/catalog";

export const LIBRARY_DATE = "octobre 2026";
export const LIBRARY_NOTE = "Tarif indicatif de la bibliothèque Pilot-Makers, à adapter : ce n'est pas un prix de marché.";

type LibItem = ItemInput & { keywords: string[] };

export type LibraryTrade = "carrelage" | "peinture" | "plomberie" | "electricite" | "maconnerie" | "platrerie" | "commun";

const mo = (name: string, unit: string, price: string, keywords: string[], extra: Partial<LibItem> = {}): LibItem => ({
  name,
  unit,
  unit_price: price,
  vat_percent: "10",
  category: "main_oeuvre",
  keywords,
  ...extra,
});
const mat = (name: string, unit: string, price: string, cost: string, keywords: string[], extra: Partial<LibItem> = {}): LibItem => ({
  name,
  unit,
  unit_price: price,
  unit_cost: cost,
  vat_percent: "10",
  category: "materiau",
  keywords,
  ...extra,
});

export const LIBRARY: Record<LibraryTrade, { label: string; items: LibItem[] }> = {
  commun: {
    label: "Prestations communes",
    items: [
      mo("Protection des sols et des meubles", "forfait", "60", ["protection", "bâche", "protéger"], { category: "forfait", subcategory: "Préparation" }),
      mo("Déplacement", "forfait", "35", ["déplacement", "trajet"], { category: "deplacement" }),
      mo("Évacuation des gravats en déchetterie", "m³", "45", ["gravats", "évacuation", "déchetterie", "déchets"], { subcategory: "Évacuation" }),
      mo("Nettoyage de fin de chantier", "forfait", "80", ["nettoyage", "nettoyer"], { category: "forfait", subcategory: "Finitions" }),
      mo("Main-d'œuvre, taux horaire", "h", "45", ["main", "heure", "horaire"]),
    ],
  },
  carrelage: {
    label: "Carrelage et faïence",
    items: [
      mo("Dépose de carrelage existant", "m²", "18", ["dépose", "déposer", "carrelage", "enlever"], { subcategory: "Dépose", description: "Dépose soignée du carrelage et de la colle, hors évacuation." }),
      mo("Ragréage du sol", "m²", "16", ["ragréage", "ragréer", "niveler", "sol"], { subcategory: "Préparation" }),
      mo("Pose de carrelage au sol", "m²", "45", ["pose", "poser", "carrelage", "sol", "carreler"], { subcategory: "Pose", description: "Pose collée, joints inclus, hors fourniture du carrelage." }),
      mo("Pose de faïence murale", "m²", "48", ["faïence", "mur", "murale", "crédence"], { subcategory: "Pose" }),
      mo("Réfection des joints", "m²", "14", ["joints", "joint", "jointoiement"], { subcategory: "Finitions" }),
      mo("Pose de plinthes carrelées", "ml", "12", ["plinthes", "plinthe"], { subcategory: "Finitions" }),
      mat("Carrelage grès cérame (fourniture)", "m²", "32", "22", ["carrelage", "grès", "fourniture", "carreaux"], { subcategory: "Fourniture" }),
      mat("Colle carrelage flexible C2S1", "sac", "24", "15", ["colle"], { subcategory: "Fourniture" }),
      mo("Système d'étanchéité sous carrelage (SPEC)", "m²", "28", ["étanchéité", "douche", "spec"], { subcategory: "Préparation" }),
    ],
  },
  peinture: {
    label: "Peinture",
    items: [
      mo("Lessivage des murs", "m²", "4", ["lessivage", "lessiver"], { subcategory: "Préparation" }),
      mo("Rebouchage et ponçage", "m²", "7", ["rebouchage", "ponçage", "enduit", "reboucher"], { subcategory: "Préparation" }),
      mo("Impression (sous-couche)", "m²", "8", ["impression", "sous-couche"], { subcategory: "Peinture" }),
      mo("Peinture murs, deux couches", "m²", "16", ["peinture", "peindre", "murs", "mur"], { subcategory: "Peinture" }),
      mo("Peinture plafond, deux couches", "m²", "19", ["plafond"], { subcategory: "Peinture" }),
      mo("Peinture boiseries", "ml", "11", ["boiseries", "plinthes", "huisseries"], { subcategory: "Peinture" }),
      mat("Peinture acrylique velours (fourniture)", "l", "14", "9", ["peinture", "acrylique", "fourniture"], { subcategory: "Fourniture" }),
    ],
  },
  plomberie: {
    label: "Plomberie et sanitaires",
    items: [
      mo("Dépose d'un appareil sanitaire", "u", "60", ["dépose", "sanitaire", "lavabo", "baignoire", "wc"], { subcategory: "Dépose" }),
      mo("Pose d'un lavabo ou vasque", "u", "150", ["lavabo", "vasque"], { subcategory: "Pose" }),
      mo("Pose d'un WC suspendu avec bâti", "u", "380", ["wc", "toilettes", "suspendu"], { subcategory: "Pose" }),
      mo("Pose d'une douche à l'italienne", "forfait", "950", ["douche", "italienne"], { subcategory: "Pose", category: "forfait" }),
      mo("Pose d'un mitigeur", "u", "75", ["mitigeur", "robinet", "robinetterie"], { subcategory: "Pose" }),
      mo("Alimentation et évacuation en PER / PVC", "ml", "38", ["alimentation", "évacuation", "tuyau", "per", "pvc"], { subcategory: "Réseaux" }),
      mo("Remplacement d'un chauffe-eau électrique 200 l", "forfait", "420", ["chauffe-eau", "ballon"], { category: "forfait" }),
    ],
  },
  electricite: {
    label: "Électricité",
    items: [
      mo("Création d'un point lumineux", "u", "95", ["point lumineux", "luminaire", "éclairage", "lumière"]),
      mo("Création d'une prise de courant", "u", "75", ["prise", "prises"]),
      mo("Remplacement du tableau électrique", "forfait", "1200", ["tableau", "disjoncteur"], { category: "forfait" }),
      mo("Pose d'un interrupteur", "u", "55", ["interrupteur"]),
      mo("Diagnostic et mise en sécurité", "forfait", "250", ["mise en sécurité", "diagnostic"], { category: "forfait" }),
    ],
  },
  maconnerie: {
    label: "Maçonnerie",
    items: [
      mo("Démolition de cloison", "m²", "35", ["démolition", "démolir", "cloison", "abattre"], { subcategory: "Démolition" }),
      mo("Ouverture dans un mur porteur avec linteau", "forfait", "1800", ["ouverture", "porteur", "linteau", "ipn"], { category: "forfait" }),
      mo("Montage de mur en parpaings", "m²", "65", ["parpaings", "parpaing", "mur", "monter"]),
      mo("Chape de ciment", "m²", "28", ["chape"]),
      mo("Dalle béton", "m²", "75", ["dalle", "béton"]),
    ],
  },
  platrerie: {
    label: "Plâtrerie et isolation",
    items: [
      mo("Cloison en plaques de plâtre sur ossature", "m²", "45", ["cloison", "placo", "plaques", "plâtre"]),
      mo("Doublage isolant des murs", "m²", "52", ["doublage", "isolant", "isolation", "murs"]),
      mo("Faux plafond en plaques de plâtre", "m²", "48", ["faux plafond", "plafond"]),
      mo("Bandes et enduits de finition", "m²", "12", ["bandes", "enduit", "joints"]),
      mo("Isolation des combles perdus par soufflage", "m²", "28", ["combles", "soufflage"], { vat_percent: "5,5" }),
    ],
  },
};

export const LIBRARY_TRADES = Object.entries(LIBRARY).map(([code, v]) => ({ code: code as LibraryTrade, label: v.label }));
