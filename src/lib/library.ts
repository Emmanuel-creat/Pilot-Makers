/**
 * Bibliothèques de prestations fournies par le logiciel, pour 15 métiers.
 *
 * Les prix sont des valeurs de départ INDICATIVES destinées à être remplacées
 * par les tarifs de l'artisan. Ils ne constituent pas des prix de marché.
 *
 * Chaque prestation porte aussi ce dont l'assistant de préparation a besoin :
 * - `when` : expressions qui doivent toutes apparaître dans une même partie de
 *   phrase de la description (texte en minuscules, sans accents) ;
 * - `section` : lot du devis où ranger la ligne ;
 * - `tip` : explication courte montrée à l'artisan à côté de la ligne proposée.
 * Le taux de TVA indiqué est celui de la rénovation d'un logement de plus de
 * deux ans ; il reste une proposition que l'artisan valide selon son client.
 */

import type { ItemInput } from "./services/catalog";

export const LIBRARY_DATE = "octobre 2026";
export const LIBRARY_NOTE = "Tarif indicatif de la bibliothèque Pilot-Makers, à adapter : ce n'est pas un prix de marché.";

export type LibItem = ItemInput & { keywords: string[]; section: string; when?: RegExp[]; tip?: string };

export type LibraryTrade =
  | "commun"
  | "carrelage"
  | "peinture"
  | "plomberie"
  | "electricite"
  | "maconnerie"
  | "platrerie"
  | "isolation"
  | "menuiserie"
  | "sols"
  | "couverture"
  | "chauffage"
  | "charpente"
  | "facade"
  | "serrurerie"
  | "exterieurs";

export interface TradeLibrary {
  label: string;
  /** Métier tel qu'il est choisi à l'inscription */
  profession: string;
  /** Mots qui signalent ce métier dans une description (texte normalisé) */
  detect: RegExp;
  /** Questions à poser au client quand ce métier est concerné */
  questions: string[];
  /** Points à vérifier avant d'émettre */
  checks: string[];
  items: LibItem[];
}

/** Verbes de création ou de remplacement ; « déposer » n'est pas reconnu comme « poser ». */
const NEW =
  /\b(pos|refai|refect|remplac|nouv|install|cree|creer|creation|realis|mettre|mise en|ajout|fourni|changer|renov|carreler|peindre|repeindre|monter|construi|isoler|poncer|vitrifier|habiller)/;
const REMOVE = /\b(depos|demol|enlev|retir|arrach|demont|casser|abattre|supprim)/;

const mo = (name: string, unit: string, price: string, keywords: string[], extra: Partial<LibItem> = {}): LibItem => ({
  name,
  unit,
  unit_price: price,
  vat_percent: "10",
  category: "main_oeuvre",
  keywords,
  section: "Travaux",
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
  section: "Fournitures",
  ...extra,
});

export const LIBRARY: Record<LibraryTrade, TradeLibrary> = {
  commun: {
    label: "Prestations communes",
    profession: "Multiservice",
    detect: /$^/,
    questions: [],
    checks: [],
    items: [
      mo("Protection des sols et des meubles", "forfait", "60", ["protection", "bâche", "protéger"], {
        category: "forfait",
        subcategory: "Préparation",
        section: "Préparation du chantier",
        when: [/protect|bach/],
        tip: "Protège le logement occupé pendant les travaux.",
      }),
      mo("Déplacement", "forfait", "35", ["déplacement", "trajet"], {
        category: "deplacement",
        section: "Préparation du chantier",
        when: [/deplacement|trajet/],
      }),
      mo("Évacuation des gravats en déchetterie", "m³", "45", ["gravats", "évacuation", "déchetterie", "déchets"], {
        subcategory: "Évacuation",
        section: "Dépose et évacuation",
        when: [/gravat|evacu|decheter|dechet/],
        tip: "Le volume réel se constate après la dépose ; gardez les bons de déchetterie.",
      }),
      mo("Location de benne", "forfait", "320", ["benne"], { category: "forfait", section: "Dépose et évacuation", when: [/benne/] }),
      mo("Nettoyage de fin de chantier", "forfait", "80", ["nettoyage", "nettoyer"], {
        category: "forfait",
        subcategory: "Finitions",
        section: "Finitions",
        when: [/nettoy/],
      }),
      mo("Main-d'œuvre, taux horaire", "h", "45", ["main", "heure", "horaire"], { section: "Travaux", when: [/taux horaire|en regie|a l heure/] }),
    ],
  },

  carrelage: {
    label: "Carrelage et faïence",
    profession: "Carreleur",
    detect: /carrel|faience|credence|gres|mosaique|\bjoints?\b|plinthe/,
    questions: [
      "Le carrelage est-il fourni par le client ou par l'entreprise ?",
      "Quel format de carreaux et quel type de pose (droite, décalée, diagonale) ?",
    ],
    checks: ["Vérifier la planéité et l'humidité du support avant la pose", "Prévoir 10 % de carreaux en plus pour les coupes"],
    items: [
      mo("Dépose de carrelage existant", "m²", "18", ["dépose", "carrelage", "enlever"], {
        subcategory: "Dépose",
        description: "Dépose soignée du carrelage et de la colle, hors évacuation.",
        section: "Dépose et évacuation",
        when: [REMOVE, /carrel|faience|revetement/],
        tip: "La dépose génère des gravats : pensez à la ligne d'évacuation.",
      }),
      mo("Ragréage du sol", "m²", "16", ["ragréage", "niveler", "sol"], {
        subcategory: "Préparation",
        section: "Préparation des supports",
        when: [/ragre|nivel|planeit/],
      }),
      mo("Pose de carrelage au sol", "m²", "45", ["pose", "carrelage", "sol", "carreler"], {
        subcategory: "Pose",
        description: "Pose collée, joints inclus, hors fourniture du carrelage.",
        section: "Pose",
        when: [NEW, /carrel|revetement|\bsol\b/],
        tip: "Fourniture du carrelage comptée à part si l'entreprise la fournit.",
      }),
      mo("Pose de faïence murale", "m²", "48", ["faïence", "mur", "murale", "crédence"], {
        subcategory: "Pose",
        section: "Pose",
        when: [/faience|credence|carrelage mural|murs? de (la )?douche/],
      }),
      mo("Réfection des joints", "m²", "14", ["joints", "jointoiement"], {
        subcategory: "Finitions",
        section: "Finitions",
        when: [/\bjoints?\b|jointoie/],
      }),
      mo("Pose de plinthes carrelées", "ml", "12", ["plinthes", "plinthe"], { subcategory: "Finitions", section: "Finitions", when: [/plinthe/] }),
      mat("Carrelage grès cérame (fourniture)", "m²", "32", "22", ["carrelage", "grès", "fourniture", "carreaux"], {
        subcategory: "Fourniture",
        when: [/fourni|achat|carreaux? (fourni|compris)/, /carrel|gres|carreaux/],
        tip: "Ajoutez 10 % à la surface pour les coupes et la casse.",
      }),
      mat("Colle carrelage flexible C2S1", "sac", "24", "15", ["colle"], { subcategory: "Fourniture", when: [/\bcolle\b/] }),
      mo("Système d'étanchéité sous carrelage (SPEC)", "m²", "28", ["étanchéité", "douche", "spec"], {
        subcategory: "Préparation",
        section: "Préparation des supports",
        when: [/etanch|douche a l italienne|douche italienne|\bspec\b/],
        tip: "Indispensable dans les zones de douche avant la pose de carrelage.",
      }),
      mo("Pose de mosaïque", "m²", "75", ["mosaïque"], { subcategory: "Pose", section: "Pose", when: [/mosaique/] }),
    ],
  },

  peinture: {
    label: "Peinture",
    profession: "Peintre",
    detect: /peint|peindre|enduit|lessiv|papier peint|tapisser|sous couche|laque/,
    questions: [
      "Quelle surface de murs et de plafonds faut-il peindre ?",
      "Quelles couleurs et quelle finition (mat, velours, satin) ?",
      "Les murs nécessitent-ils une préparation (rebouchage, ponçage) ?",
    ],
    checks: [
      "Compter les surfaces murs et plafonds séparément, ouvertures déduites",
      "Vérifier l'état des supports (fissures, humidité, anciennes peintures)",
    ],
    items: [
      mo("Lessivage des murs", "m²", "4", ["lessivage", "lessiver"], {
        subcategory: "Préparation",
        section: "Préparation des supports",
        when: [/lessiv/],
      }),
      mo("Rebouchage et ponçage", "m²", "7", ["rebouchage", "ponçage", "enduit"], {
        subcategory: "Préparation",
        section: "Préparation des supports",
        when: [/rebouch|ponc|enduit|fissure|trou/],
        tip: "Un support mal préparé fait ressortir chaque défaut après peinture.",
      }),
      mo("Impression (sous-couche)", "m²", "8", ["impression", "sous-couche"], {
        subcategory: "Peinture",
        section: "Préparation des supports",
        when: [/impression|sous couche/],
      }),
      mo("Peinture murs, deux couches", "m²", "16", ["peinture", "murs", "mur"], {
        subcategory: "Peinture",
        section: "Peinture",
        when: [/peint|peindre/, /\bmurs?\b|piece|chambre|salon|sejour|cuisine|couloir|entree|appartement|maison/],
      }),
      mo("Peinture plafond, deux couches", "m²", "19", ["plafond"], {
        subcategory: "Peinture",
        section: "Peinture",
        when: [/peint|peindre|blanchir/, /plafond/],
      }),
      mo("Peinture boiseries", "ml", "11", ["boiseries", "huisseries"], {
        subcategory: "Peinture",
        section: "Peinture",
        when: [/boiseri|huisseri|portes?|fenetres?|volets?/, /peint|peindre|laqu/],
      }),
      mo("Pose de papier peint", "m²", "22", ["papier peint", "tapisserie"], {
        subcategory: "Revêtements",
        section: "Peinture",
        when: [/papier peint|tapiss|toile de verre/],
      }),
      mo("Dépose de papier peint", "m²", "6", ["dépose", "papier peint"], {
        subcategory: "Dépose",
        section: "Dépose et évacuation",
        when: [REMOVE, /papier|tapiss/],
      }),
      mat("Peinture acrylique velours (fourniture)", "l", "14", "9", ["peinture", "acrylique", "fourniture"], {
        subcategory: "Fourniture",
        when: [/fourni/, /peinture/],
      }),
    ],
  },

  plomberie: {
    label: "Plomberie et sanitaires",
    profession: "Plombier",
    detect:
      /plomb|lavabo|vasque|\bwc\b|toilette|douche|baignoire|mitigeur|robinet|evier|chauffe eau|ballon|tuyau|canalis|fuite|sanitaire|evacuation d eau/,
    questions: ["Les appareils sanitaires sont-ils fournis par le client ?", "Les arrivées d'eau et les évacuations restent-elles au même endroit ?"],
    checks: ["Repérer les arrivées d'eau et les évacuations existantes", "Prévoir la coupure d'eau et la remise en service"],
    items: [
      mo("Dépose d'un appareil sanitaire", "u", "60", ["dépose", "sanitaire", "lavabo", "baignoire", "wc"], {
        subcategory: "Dépose",
        section: "Dépose et évacuation",
        when: [REMOVE, /lavabo|vasque|\bwc\b|toilette|baignoire|douche|evier|sanitaire|bidet/],
      }),
      mo("Pose d'un lavabo ou vasque", "u", "150", ["lavabo", "vasque"], {
        subcategory: "Pose",
        section: "Équipements",
        when: [/lavabo|vasque|meuble de salle de bain/],
      }),
      mo("Pose d'un WC suspendu avec bâti", "u", "380", ["wc", "toilettes", "suspendu"], {
        subcategory: "Pose",
        section: "Équipements",
        when: [/\bwc\b|toilette/],
      }),
      mo("Pose d'une douche à l'italienne", "forfait", "950", ["douche", "italienne"], {
        subcategory: "Pose",
        category: "forfait",
        section: "Équipements",
        when: [/douche/],
        tip: "Vérifiez la pente d'évacuation possible avant de promettre une douche de plain-pied.",
      }),
      mo("Pose d'une baignoire", "u", "420", ["baignoire"], { subcategory: "Pose", section: "Équipements", when: [NEW, /baignoire/] }),
      mo("Pose d'un mitigeur", "u", "75", ["mitigeur", "robinet", "robinetterie"], {
        subcategory: "Pose",
        section: "Équipements",
        when: [/mitigeur|robinet/],
      }),
      mo("Pose d'un évier de cuisine", "u", "160", ["évier"], { subcategory: "Pose", section: "Équipements", when: [/evier/] }),
      mo("Alimentation et évacuation en PER / PVC", "ml", "38", ["alimentation", "évacuation", "tuyau", "per", "pvc"], {
        subcategory: "Réseaux",
        section: "Réseaux",
        when: [/alimentation|evacuations? d eau|tuyau|canalis|reseau|\bper\b|\bpvc\b|deplacer/],
      }),
      mo("Remplacement d'un chauffe-eau électrique 200 l", "forfait", "420", ["chauffe-eau", "ballon"], {
        category: "forfait",
        section: "Équipements",
        when: [/chauffe eau|ballon/],
      }),
      mo("Recherche et réparation de fuite", "forfait", "140", ["fuite"], { category: "forfait", section: "Travaux", when: [/fuite/] }),
    ],
  },

  electricite: {
    label: "Électricité",
    profession: "Électricien",
    detect: /electri|\bprises?\b|interrupteur|luminaire|eclairage|points? lumineux|tableau|disjoncteur|spot|cable|consuel|vmc/,
    questions: [
      "Combien de prises, d'interrupteurs et de points lumineux faut-il prévoir ?",
      "Le tableau électrique actuel est-il récent et équipé de différentiels 30 mA ?",
    ],
    checks: [
      "Appliquer la norme NF C 15-100 aux circuits créés ou modifiés",
      "Prévoir l'attestation de conformité si l'installation est entièrement refaite",
    ],
    items: [
      mo("Création d'un point lumineux", "u", "95", ["point lumineux", "luminaire", "éclairage"], {
        section: "Équipements",
        when: [/points? lumineux|luminaire|eclairage|lumiere|plafonnier/],
      }),
      mo("Création d'une prise de courant", "u", "75", ["prise", "prises"], { section: "Équipements", when: [/prises?\b/] }),
      mo("Pose d'un interrupteur", "u", "55", ["interrupteur"], { section: "Équipements", when: [/interrupteur|va et vient/] }),
      mo("Pose de spots encastrés", "u", "65", ["spot", "spots"], { section: "Équipements", when: [/spots?\b/] }),
      mo("Remplacement du tableau électrique", "forfait", "1200", ["tableau", "disjoncteur"], {
        category: "forfait",
        section: "Réseaux",
        when: [/tableau|disjoncteur/],
        tip: "Le tableau conditionne la sécurité de toute l'installation.",
      }),
      mo("Création d'un circuit spécialisé", "u", "180", ["circuit", "four", "plaque", "lave-linge"], {
        section: "Réseaux",
        when: [/circuit|plaque de cuisson|four|lave linge|lave vaisselle|borne/],
      }),
      mo("Diagnostic et mise en sécurité", "forfait", "250", ["mise en sécurité", "diagnostic"], {
        category: "forfait",
        section: "Travaux",
        when: [/mise en securite|diagnostic|vetuste/],
      }),
      mo("Installation d'une VMC simple flux", "forfait", "650", ["vmc", "ventilation"], {
        category: "forfait",
        section: "Équipements",
        when: [/vmc|ventilation/],
        vat_percent: "5,5",
        tip: "Taux réduit possible si les conditions de la rénovation énergétique sont remplies.",
      }),
      mo("Saignées et rebouchage", "ml", "18", ["saignée"], { section: "Préparation des supports", when: [/saignee|encastr/] }),
    ],
  },

  maconnerie: {
    label: "Maçonnerie",
    profession: "Maçon",
    detect: /macon|mur porteur|cloison|parpaing|beton|chape|dalle|fondation|demol|ouverture|linteau|ipn|muret/,
    questions: ["Le mur concerné est-il porteur ?", "L'accès permet-il l'approche d'engins ou de matériaux lourds ?"],
    checks: [
      "Faire valider toute ouverture dans un mur porteur par une étude de structure",
      "Vérifier si les travaux demandent une déclaration en mairie",
    ],
    items: [
      mo("Démolition de cloison", "m²", "35", ["démolition", "cloison", "abattre"], {
        subcategory: "Démolition",
        section: "Dépose et évacuation",
        when: [REMOVE, /cloison|mur\b/],
      }),
      mo("Ouverture dans un mur porteur avec linteau", "forfait", "1800", ["ouverture", "porteur", "linteau", "ipn"], {
        category: "forfait",
        section: "Gros œuvre",
        when: [/porteur|linteau|\bipn\b|tremie/],
        tip: "Étayage, linteau et étude de structure sont à prévoir.",
      }),
      mo("Montage de mur en parpaings", "m²", "65", ["parpaings", "mur", "monter"], {
        section: "Gros œuvre",
        when: [/parpaing|muret|monter un mur/],
      }),
      mo("Chape de ciment", "m²", "28", ["chape"], { section: "Préparation des supports", when: [/chape/] }),
      mo("Dalle béton", "m²", "75", ["dalle", "béton"], { section: "Gros œuvre", when: [/dalle|beton/] }),
      mo("Fondations en béton armé", "ml", "120", ["fondation", "semelle"], { section: "Gros œuvre", when: [/fondation|semelle/] }),
      mo("Enduit de façade au mortier", "m²", "38", ["enduit", "crépi"], {
        section: "Finitions",
        when: [/crepi|enduit exterieur|enduit au mortier/],
      }),
    ],
  },

  platrerie: {
    label: "Plâtrerie et cloisons",
    profession: "Plaquiste",
    detect: /platr|placo|plaque|cloison|doublage|faux plafond|bande/,
    questions: ["Quelle est la hauteur sous plafond ?", "Faut-il des plaques hydrofuges (pièce humide) ou phoniques ?"],
    checks: ["Prévoir des plaques hydrofuges dans les pièces humides", "Coordonner le passage des gaines électriques avant la fermeture"],
    items: [
      mo("Cloison en plaques de plâtre sur ossature", "m²", "45", ["cloison", "placo", "plaques", "plâtre"], {
        section: "Gros œuvre",
        when: [NEW, /cloison|placo|plaques?/],
      }),
      mo("Doublage des murs en plaques de plâtre", "m²", "42", ["doublage", "murs"], { section: "Gros œuvre", when: [/doublage|habiller les murs/] }),
      mo("Faux plafond en plaques de plâtre", "m²", "48", ["faux plafond", "plafond"], {
        section: "Gros œuvre",
        when: [/faux plafond|plafond suspendu|abaisser le plafond/],
      }),
      mo("Bandes et enduits de finition", "m²", "12", ["bandes", "enduit", "joints"], { section: "Finitions", when: [/bandes?\b|placo|plaques?/] }),
      mo("Coffrage de gaine ou de tuyaux", "ml", "38", ["coffrage", "gaine"], {
        section: "Gros œuvre",
        when: [/coffrage|coffrer|cacher les tuyaux/],
      }),
    ],
  },

  isolation: {
    label: "Isolation",
    profession: "Isolateur",
    detect: /isol|comble|laine|soufflage|ite\b|iti\b|thermique|pont thermique/,
    questions: ["Le client souhaite-t-il demander des aides (MaPrimeRénov', CEE) ?", "Quelle résistance thermique vise-t-on ?"],
    checks: [
      "Vérifier les conditions du taux de TVA à 5,5 % (logement de plus de deux ans, travaux éligibles)",
      "Indiquer la résistance thermique R sur le devis si le client demande des aides",
    ],
    items: [
      mo("Isolation des combles perdus par soufflage", "m²", "28", ["combles", "soufflage"], {
        vat_percent: "5,5",
        section: "Isolation",
        when: [/comble/],
        tip: "Indiquez la résistance thermique obtenue, utile pour les aides.",
      }),
      mo("Isolation des rampants de toiture", "m²", "55", ["rampants", "toiture"], {
        vat_percent: "5,5",
        section: "Isolation",
        when: [/rampant|sous toiture|sous la toiture/],
      }),
      mo("Doublage isolant des murs par l'intérieur", "m²", "58", ["doublage", "isolant", "murs"], {
        vat_percent: "5,5",
        section: "Isolation",
        when: [/isol/, /murs?\b|interieur|doublage/],
      }),
      mo("Isolation des murs par l'extérieur", "m²", "140", ["ite", "extérieur", "façade"], {
        vat_percent: "5,5",
        section: "Isolation",
        when: [/isol/, /exterieur|facade|\bite\b/],
      }),
      mo("Isolation du plancher bas", "m²", "45", ["plancher", "sous-sol", "vide sanitaire"], {
        vat_percent: "5,5",
        section: "Isolation",
        when: [/isol/, /plancher|sous sol|vide sanitaire|garage/],
      }),
      mat("Laine minérale (fourniture)", "m²", "12", "7", ["laine", "isolant", "fourniture"], {
        vat_percent: "5,5",
        when: [/fourni/, /laine|isolant/],
      }),
    ],
  },

  menuiserie: {
    label: "Menuiserie",
    profession: "Menuisier",
    detect: /menuis|fenetre|porte|volet|placard|dressing|escalier|baie|vitrage|parquet flottant/,
    questions: [
      "Quelles dimensions et quel matériau (PVC, bois, aluminium) ?",
      "La pose se fait-elle en rénovation sur l'ancien dormant ou en dépose totale ?",
    ],
    checks: ["Relever les cotes exactes sur place avant la commande", "Préciser le coefficient Uw des fenêtres si le client demande des aides"],
    items: [
      mo("Dépose d'une menuiserie existante", "u", "80", ["dépose", "fenêtre", "porte"], {
        section: "Dépose et évacuation",
        when: [REMOVE, /fenetre|porte|volet|menuiserie/],
      }),
      mo("Pose d'une fenêtre double vitrage", "u", "650", ["fenêtre", "double vitrage"], {
        vat_percent: "5,5",
        section: "Menuiseries",
        when: [/fenetre|double vitrage|baie/],
        tip: "Taux de 5,5 % seulement si le remplacement améliore la performance énergétique.",
      }),
      mo("Pose d'une porte intérieure", "u", "280", ["porte", "intérieure"], {
        section: "Menuiseries",
        when: [/portes?\b/, /interieur|chambre|bloc porte/],
      }),
      mo("Pose d'une porte d'entrée", "u", "1400", ["porte d'entrée"], { section: "Menuiseries", when: [/porte d entree/] }),
      mo("Pose de volets roulants", "u", "520", ["volet", "roulant"], { section: "Menuiseries", when: [/volet/] }),
      mo("Placard sur mesure", "ml", "450", ["placard", "dressing"], { section: "Agencement", when: [/placard|dressing/] }),
      mo("Pose d'une cuisine équipée", "ml", "180", ["cuisine", "meubles"], { section: "Agencement", when: [/cuisine/, NEW] }),
      mo("Habillage d'escalier", "u", "1200", ["escalier"], { category: "forfait", section: "Agencement", when: [/escalier/] }),
    ],
  },

  sols: {
    label: "Parquet et sols souples",
    profession: "Solier",
    detect: /parquet|stratifi|vinyle|lino|moquette|sol souple|vitrifi/,
    questions: ["Quel revêtement le client a-t-il choisi (parquet massif, contrecollé, stratifié, vinyle) ?", "Le sol actuel doit-il être déposé ?"],
    checks: ["Vérifier l'humidité du support avant la pose d'un parquet", "Prévoir les seuils et les barres de transition"],
    items: [
      mo("Dépose de revêtement de sol souple ou parquet", "m²", "12", ["dépose", "moquette", "parquet"], {
        section: "Dépose et évacuation",
        when: [REMOVE, /parquet|moquette|lino|vinyle|stratifi/],
      }),
      mo("Pose de parquet flottant", "m²", "28", ["parquet", "flottant", "stratifié"], { section: "Pose", when: [NEW, /parquet|stratifi|lames/] }),
      mo("Pose de sol vinyle en lames", "m²", "26", ["vinyle", "lames"], { section: "Pose", when: [NEW, /vinyle|lino|sol souple/] }),
      mo("Pose de moquette", "m²", "20", ["moquette"], { section: "Pose", when: [NEW, /moquette/] }),
      mo("Ponçage et vitrification de parquet", "m²", "32", ["ponçage", "vitrification"], {
        section: "Pose",
        when: [/ponc|vitrifi|renov/, /parquet/],
      }),
      mo("Sous-couche acoustique", "m²", "5", ["sous-couche"], { section: "Préparation des supports", when: [/sous couche|acoustique|phonique/] }),
      mo("Pose de plinthes bois", "ml", "10", ["plinthes"], { section: "Finitions", when: [/plinthe/] }),
    ],
  },

  couverture: {
    label: "Couverture et zinguerie",
    profession: "Couvreur",
    detect: /toit|couverture|tuile|ardoise|gouttiere|zinguer|faitage|velux|fenetre de toit|demoussage|ecran sous toiture/,
    questions: ["Quelle est la surface et la pente de la toiture ?", "Quel est l'accès à la toiture (hauteur, échafaudage possible) ?"],
    checks: [
      "Prévoir l'échafaudage ou la nacelle et les protections contre les chutes",
      "Vérifier si une déclaration préalable est nécessaire en mairie",
    ],
    items: [
      mo("Installation d'échafaudage", "m²", "14", ["échafaudage"], {
        section: "Préparation du chantier",
        when: [/echafaud|toit|couverture|facade/],
        tip: "Obligatoire pour travailler en hauteur en sécurité.",
      }),
      mo("Démoussage et traitement de toiture", "m²", "18", ["démoussage", "traitement"], {
        section: "Couverture",
        when: [/demouss|traitement|hydrofuge/],
      }),
      mo("Remplacement de tuiles cassées", "u", "18", ["tuiles", "cassées"], {
        section: "Couverture",
        when: [/tuiles?\b/, /cass|remplac|fuite|abim/],
      }),
      mo("Réfection complète de couverture en tuiles", "m²", "120", ["réfection", "couverture", "tuiles"], {
        section: "Couverture",
        when: [/refect|refaire|renov|remplac/, /toit|couverture|toiture/],
      }),
      mo("Pose d'un écran sous toiture", "m²", "22", ["écran"], { section: "Couverture", when: [/ecran/] }),
      mo("Remplacement de gouttières en zinc", "ml", "55", ["gouttière", "zinc"], { section: "Zinguerie", when: [/gouttiere|zinc|descente/] }),
      mo("Réfection du faîtage", "ml", "65", ["faîtage"], { section: "Couverture", when: [/faitage|faitiere/] }),
      mo("Pose d'une fenêtre de toit", "u", "900", ["fenêtre de toit", "velux"], {
        section: "Couverture",
        when: [/fenetre de toit|velux|chassis de toit/],
      }),
    ],
  },

  chauffage: {
    label: "Chauffage et climatisation",
    profession: "Chauffagiste",
    detect: /chauff|chaudiere|radiateur|pompe a chaleur|\bpac\b|clim|plancher chauffant|poele|thermostat|entretien annuel/,
    questions: [
      "Quel est le mode de chauffage actuel et la surface chauffée ?",
      "Le client souhaite-t-il demander des aides à la rénovation énergétique ?",
    ],
    checks: ["Vérifier la qualification RGE exigée pour les aides du client", "Dimensionner l'équipement selon les déperditions du logement"],
    items: [
      mo("Remplacement de chaudière gaz à condensation", "forfait", "3800", ["chaudière", "condensation"], {
        category: "forfait",
        vat_percent: "5,5",
        section: "Équipements",
        when: [/chaudiere/],
      }),
      mo("Installation d'une pompe à chaleur air-eau", "forfait", "11000", ["pompe à chaleur", "pac"], {
        category: "forfait",
        vat_percent: "5,5",
        section: "Équipements",
        when: [/pompe a chaleur|\bpac\b/],
        tip: "Taux de 5,5 % si les conditions de la rénovation énergétique sont remplies.",
      }),
      mo("Pose d'un radiateur à eau", "u", "320", ["radiateur"], { section: "Équipements", when: [/radiateur/] }),
      mo("Climatisation réversible monosplit", "u", "1900", ["climatisation", "split"], { section: "Équipements", when: [/clim/] }),
      mo("Plancher chauffant hydraulique", "m²", "70", ["plancher chauffant"], { section: "Équipements", when: [/plancher chauffant/] }),
      mo("Pose d'un thermostat programmable", "u", "190", ["thermostat"], {
        vat_percent: "5,5",
        section: "Équipements",
        when: [/thermostat|programmat|regulation/],
      }),
      mo("Désembouage du circuit de chauffage", "forfait", "450", ["désembouage"], {
        category: "forfait",
        section: "Travaux",
        when: [/desemboua|embou/],
      }),
      mo("Entretien annuel de chaudière", "forfait", "130", ["entretien"], { category: "forfait", section: "Travaux", when: [/entretien/] }),
    ],
  },

  charpente: {
    label: "Charpente",
    profession: "Charpentier",
    detect: /charpent|poutre|chevron|panne|ossature bois|traitement des bois|termite|capricorne|pergola|extension bois/,
    questions: ["Les bois présentent-ils des signes d'insectes ou de champignons ?", "Faut-il une note de calcul pour les nouvelles portées ?"],
    checks: ["Faire contrôler l'état des bois existants avant de chiffrer un renforcement"],
    items: [
      mo("Traitement curatif de charpente", "m²", "35", ["traitement", "insectes", "capricorne"], {
        section: "Charpente",
        when: [/traitement|termite|capricorne|insecte|vrillette/],
      }),
      mo("Remplacement de chevrons", "ml", "45", ["chevrons"], { section: "Charpente", when: [/chevron/] }),
      mo("Renforcement de poutre", "u", "450", ["poutre", "renfort"], { section: "Charpente", when: [/poutre|renfor/] }),
      mo("Charpente traditionnelle neuve", "m²", "110", ["charpente", "neuve"], {
        vat_percent: "20",
        section: "Charpente",
        when: [NEW, /charpente/],
      }),
      mo("Pergola en bois", "u", "3200", ["pergola"], { category: "forfait", vat_percent: "20", section: "Charpente", when: [/pergola|carport/] }),
    ],
  },

  facade: {
    label: "Façade et ravalement",
    profession: "Façadier",
    detect: /facade|ravalement|crepi|nettoyage haute pression|fissure de facade|enduit exterieur/,
    questions: ["Quelle est la surface de façade et sa hauteur ?", "Quel est l'état de l'enduit actuel (fissures, décollements) ?"],
    checks: [
      "Vérifier si une déclaration préalable est nécessaire en mairie",
      "Prévoir l'échafaudage et l'autorisation d'occupation du trottoir si besoin",
    ],
    items: [
      mo("Nettoyage de façade haute pression", "m²", "12", ["nettoyage", "haute pression"], {
        section: "Préparation des supports",
        when: [/nettoy|haute pression|karcher|lavage/],
      }),
      mo("Traitement des fissures de façade", "ml", "28", ["fissures"], { section: "Préparation des supports", when: [/fissure/] }),
      mo("Peinture de façade, deux couches", "m²", "32", ["peinture", "façade"], { section: "Façade", when: [/peint|peindre/] }),
      mo("Enduit de ravalement projeté", "m²", "48", ["enduit", "ravalement"], { section: "Façade", when: [/ravalement|enduit|crepi/] }),
      mo("Traitement hydrofuge de façade", "m²", "14", ["hydrofuge"], { section: "Façade", when: [/hydrofug|impermeab/] }),
    ],
  },

  serrurerie: {
    label: "Serrurerie et métallerie",
    profession: "Serrurier",
    detect: /serrur|serrure|cylindre|blind|portail|garde corps|grille|rampe|metall|acier|ouverture de porte/,
    questions: ["Quel niveau de sécurité est attendu (certification de la serrure) ?", "Les dimensions de l'ouvrage ont-elles été relevées ?"],
    checks: ["Relever les cotes avant la fabrication d'un ouvrage sur mesure"],
    items: [
      mo("Ouverture de porte claquée", "forfait", "120", ["ouverture", "porte claquée"], {
        category: "forfait",
        section: "Travaux",
        when: [/claque|ouverture de porte|enferme/],
      }),
      mo("Remplacement de cylindre de serrure", "u", "140", ["cylindre", "serrure"], { section: "Travaux", when: [/cylindre|barillet|serrure/] }),
      mo("Pose d'une serrure multipoints", "u", "450", ["serrure", "multipoints"], {
        section: "Travaux",
        when: [/multipoint|trois points|3 points/],
      }),
      mo("Blindage de porte", "u", "1600", ["blindage"], { section: "Travaux", when: [/blind/] }),
      mo("Garde-corps en acier", "ml", "260", ["garde-corps", "rambarde"], { section: "Métallerie", when: [/garde corps|rambarde|balcon/] }),
      mo("Rampe d'escalier en acier", "ml", "220", ["rampe"], { section: "Métallerie", when: [/rampe|main courante/] }),
      mo("Pose d'un portail", "u", "1800", ["portail"], { vat_percent: "20", section: "Métallerie", when: [/portail|portillon/] }),
    ],
  },

  exterieurs: {
    label: "Aménagements extérieurs",
    profession: "Paysagiste",
    detect: /jardin|terrasse|cloture|haie|gazon|pelouse|allee|paysag|bordure|arrosage|elagage|terrassement|pave/,
    questions: ["Quelle est la surface à aménager et la nature du terrain ?", "Faut-il évacuer la terre ou les déchets verts ?"],
    checks: ["Vérifier le taux de TVA applicable aux travaux extérieurs, souvent 20 %", "Déclarer les réseaux enterrés (DT-DICT) avant de creuser"],
    items: [
      mo("Terrassement et décaissement", "m³", "55", ["terrassement", "décaissement"], {
        vat_percent: "20",
        section: "Terrassement",
        when: [/terrass(e|ement)|decaiss|creuser/],
      }),
      mo("Terrasse en lames de bois sur plots", "m²", "140", ["terrasse", "bois", "lames"], {
        vat_percent: "20",
        section: "Aménagement",
        when: [/terrasse/],
      }),
      mo("Pose de pavés autobloquants", "m²", "75", ["pavés", "allée"], { vat_percent: "20", section: "Aménagement", when: [/pave|allee/] }),
      mo("Pose de clôture rigide", "ml", "65", ["clôture"], { vat_percent: "20", section: "Aménagement", when: [/cloture|grillage/] }),
      mo("Création de gazon", "m²", "9", ["gazon", "pelouse"], { vat_percent: "20", section: "Plantations", when: [/gazon|pelouse/] }),
      mo("Plantation de haie", "ml", "35", ["haie"], { vat_percent: "20", section: "Plantations", when: [/haie/, NEW] }),
      mo("Taille de haie", "ml", "6", ["taille", "haie"], { vat_percent: "20", section: "Entretien", when: [/taill|elag/] }),
      mo("Évacuation des déchets verts", "m³", "40", ["déchets verts"], {
        vat_percent: "20",
        section: "Entretien",
        when: [/dechets verts|branchages/],
      }),
    ],
  },
};

export const LIBRARY_TRADES = (Object.entries(LIBRARY) as [LibraryTrade, TradeLibrary][]).map(([code, v]) => ({
  code,
  label: v.label,
  profession: v.profession,
}));

/** Métiers proposés à l'inscription : un par bibliothèque, plus « Multiservice » et « Autre ». */
export const PROFESSIONS = [...LIBRARY_TRADES.filter((t) => t.code !== "commun").map((t) => t.profession), "Multiservice", "Autre"];

/** Bibliothèque correspondant au métier saisi à l'inscription. */
export function tradeForProfession(profession: string): LibraryTrade | null {
  const p = profession.trim().toLowerCase();
  const found = LIBRARY_TRADES.find((t) => t.code !== "commun" && t.profession.toLowerCase() === p);
  return found ? found.code : null;
}
