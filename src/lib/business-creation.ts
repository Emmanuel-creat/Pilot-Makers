/**
 * Créer son entreprise artisanale en une journée : choix du statut à partir du chiffre d'affaires et des charges
 * attendus, puis la journée type, de l'immatriculation au premier devis envoyé. Fonctions pures, montants en euros.
 *
 * Les taux sont des ordres de grandeur pour comparer les statuts entre eux (barèmes 2025, impôt sur le revenu
 * non compris) ; le choix définitif se valide avec un expert-comptable ou la chambre de métiers.
 */

/** Plafond de chiffre d'affaires de la micro-entreprise pour les prestations de services artisanales */
export const MICRO_CEILING = 77_700;
/** Seuil de franchise de TVA pour les prestations de services */
export const VAT_FRANCHISE = 37_500;
/** Cotisations de la micro-entreprise, prestations artisanales : part du chiffre d'affaires */
export const MICRO_RATE = 0.212;
/** Cotisations d'un travailleur non salarié : part du revenu net */
export const TNS_RATE = 0.45;
/** Charges sociales d'un président de SAS rémunéré : part du salaire net */
export const SASU_RATE = 0.82;

export const STATUSES = {
  micro: {
    label: "Micro-entreprise",
    protection: "Patrimoine personnel séparé du patrimoine professionnel, de droit depuis 2022.",
    paperwork: "La plus simple : déclaration du chiffre d'affaires chaque mois ou trimestre, pas de bilan.",
  },
  ei_reel: {
    label: "Entreprise individuelle au réel",
    protection: "Patrimoine personnel séparé du patrimoine professionnel.",
    paperwork: "Comptabilité complète et bilan annuel ; les charges se déduisent.",
  },
  eurl: {
    label: "EURL (société à associé unique)",
    protection: "Responsabilité limitée aux apports.",
    paperwork: "Statuts, comptes annuels déposés ; gérant travailleur non salarié.",
  },
  sasu: {
    label: "SASU (société par actions simplifiée unipersonnelle)",
    protection: "Responsabilité limitée aux apports.",
    paperwork: "Statuts, comptes annuels ; président assimilé salarié, mieux couvert mais plus cher en cotisations.",
  },
} as const;
export type StatusKey = keyof typeof STATUSES;

export interface StatusResult {
  key: StatusKey;
  label: string;
  eligible: boolean;
  reason: string;
  contributions: number;
  net: number;
  /** Revenu net mensuel */
  netMonth: number;
  protection: string;
  paperwork: string;
}

const round = (n: number) => Math.round(n);

export function compareStatuses(revenue: number, costs: number) {
  const r = Math.max(0, revenue);
  const c = Math.max(0, costs);
  const surplus = Math.max(0, r - c);
  const build = (key: StatusKey, eligible: boolean, reason: string, contributions: number, net: number): StatusResult => ({
    key,
    label: STATUSES[key].label,
    eligible,
    reason,
    contributions: round(contributions),
    net: round(net),
    netMonth: round(net / 12),
    protection: STATUSES[key].protection,
    paperwork: STATUSES[key].paperwork,
  });
  const microContrib = r * MICRO_RATE;
  const tnsNet = surplus / (1 + TNS_RATE);
  const sasuNet = surplus / (1 + SASU_RATE);
  const rows = [
    build(
      "micro",
      r <= MICRO_CEILING,
      r <= MICRO_CEILING
        ? "Cotisations sur le chiffre d'affaires, charges non déduites."
        : `Chiffre d'affaires au-dessus du plafond de ${MICRO_CEILING.toLocaleString("fr-FR")} €.`,
      microContrib,
      Math.max(0, r - c - microContrib),
    ),
    build("ei_reel", true, "Cotisations sur le bénéfice, charges déduites.", surplus - tnsNet, tnsNet),
    build("eurl", true, "Cotisations sur la rémunération du gérant, charges déduites.", surplus - tnsNet, tnsNet),
    build("sasu", true, "Toute la marge versée en salaire au président.", surplus - sasuNet, sasuNet),
  ];
  const eligible = rows.filter((x) => x.eligible);
  const best = eligible.reduce((a, b) => (b.net > a.net + 1 ? b : a));
  const advice: string[] = [];
  if (best.key === "micro") advice.push("La micro-entreprise rapporte le plus ici, avec le moins de formalités : idéale pour démarrer.");
  else if (r <= MICRO_CEILING)
    advice.push(
      `Vos charges représentent ${r ? Math.round((c / r) * 100) : 0} % du chiffre d'affaires : en micro-entreprise, elles ne se déduisent pas, un régime au réel est plus intéressant.`,
    );
  if (r > VAT_FRANCHISE) advice.push(`Au-delà de ${VAT_FRANCHISE.toLocaleString("fr-FR")} € de prestations, vous facturez la TVA à vos clients.`);
  else advice.push("Sous le seuil de franchise, vous pouvez facturer sans TVA (mention « TVA non applicable, article 293 B du CGI »).");
  return { rows, best: best.key, advice };
}

export interface DayStep {
  time: string;
  title: string;
  detail: string;
}

/** La journée de création, du matin au soir */
export const CREATION_DAY: DayStep[] = [
  { time: "8 h", title: "Choisir le statut", detail: "Comparez les statuts ci-dessus avec votre chiffre d'affaires et vos charges attendus." },
  {
    time: "9 h",
    title: "Immatriculer l'entreprise",
    detail:
      "Déclaration en ligne sur le guichet unique de l'INPI (formalites.entreprises.gouv.fr), avec pièce d'identité, justificatif de domicile et diplôme ou trois ans d'expérience pour l'activité artisanale. Le SIRET arrive en général sous quelques jours ; vous pouvez tout préparer dès aujourd'hui.",
  },
  {
    time: "11 h",
    title: "Assurer l'activité",
    detail: "Demandez l'attestation d'assurance décennale (obligatoire pour les travaux de construction) et une responsabilité civile professionnelle.",
  },
  { time: "13 h", title: "Ouvrir le compte professionnel", detail: "Un compte dédié à l'activité, obligatoire en société, conseillé partout." },
  {
    time: "14 h",
    title: "Créer le compte Pilot-Makers",
    detail: "Identité, logo, SIRET dès réception et assurance : les mentions obligatoires des devis sont prêtes.",
  },
  { time: "15 h", title: "Installer le catalogue du métier", detail: "Une bibliothèque de prestations par métier, à ajuster à vos prix." },
  { time: "16 h", title: "Ouvrir la vitrine", detail: "Une page publique avec vos réalisations, vos garanties et un formulaire de demande de devis." },
  { time: "17 h", title: "Envoyer le premier devis", detail: "Devis émis, envoyé par e-mail ou SMS, signé en ligne par le client." },
];

export function readAmount(v: string | undefined) {
  const n = Number(
    String(v ?? "")
      .replace(/\s/g, "")
      .replace(",", "."),
  );
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 10_000_000) : null;
}
