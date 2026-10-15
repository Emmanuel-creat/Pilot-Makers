/**
 * Note de confiance de l'artisan, fondée uniquement sur des chantiers vérifiés : un chantier ne
 * compte que s'il a un procès-verbal de réception signé dans l'application, et un avis ne compte
 * que s'il a été déposé par le client de ce chantier. Rien n'est déclaratif, sauf l'assurance,
 * dont l'attestation est déjà demandée au profil. La note n'existe qu'à partir de trois chantiers
 * réceptionnés, pour ne pas juger sur un seul cas.
 */

export const MIN_VERIFIED_JOBS = 3;
/** Retard toléré entre la fin prévue et la réception, en jours. */
export const DELAY_TOLERANCE_DAYS = 7;
const VOLUME_CAP = 20;

export interface TrustFacts {
  /** Chantiers avec procès-verbal de réception (hors refus de réception). */
  receivedJobs: number;
  /** Réceptions sans réserve. */
  cleanReceptions: number;
  reservesTotal: number;
  reservesLifted: number;
  /** Chantiers réceptionnés qui avaient une date de fin prévue. */
  jobsWithPlannedEnd: number;
  /** Parmi eux, réceptionnés au plus tard 7 jours après la fin prévue. */
  jobsOnTime: number;
  /** Notes des avis déposés par les clients de chantiers réceptionnés. */
  ratings: number[];
  insured: boolean;
  registered: boolean;
}

export interface TrustCriterion {
  key: string;
  label: string;
  points: number;
  max: number;
  detail: string;
}

export interface TrustScore {
  score: number | null;
  level: "a_construire" | "en_progres" | "bonne" | "tres_bonne" | "excellente";
  levelLabel: string;
  criteria: TrustCriterion[];
  verifiedJobs: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
const pct = (a: number, b: number) => `${Math.round(ratio(a, b) * 100)} %`;
const plural = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export function trustScore(f: TrustFacts): TrustScore {
  const avg = f.ratings.length ? f.ratings.reduce((s, r) => s + r, 0) / f.ratings.length : null;
  const criteria: TrustCriterion[] = [
    {
      key: "volume",
      label: "Chantiers réceptionnés",
      max: 25,
      points: Math.round((25 * Math.min(f.receivedJobs, VOLUME_CAP)) / VOLUME_CAP),
      detail: `${plural(f.receivedJobs, "chantier réceptionné", "chantiers réceptionnés")} avec procès-verbal signé (plafond à ${VOLUME_CAP}).`,
    },
    {
      key: "qualite",
      label: "Réceptions sans réserve",
      max: 20,
      points: Math.round(20 * ratio(f.cleanReceptions, f.receivedJobs)),
      detail: f.receivedJobs ? `${pct(f.cleanReceptions, f.receivedJobs)} des réceptions sans aucune réserve.` : "Aucune réception pour l'instant.",
    },
    {
      key: "reserves",
      label: "Réserves levées",
      max: 10,
      points: f.reservesTotal ? Math.round(10 * ratio(f.reservesLifted, f.reservesTotal)) : f.receivedJobs ? 10 : 0,
      detail: f.reservesTotal ? `${f.reservesLifted} sur ${plural(f.reservesTotal, "réserve levée", "réserves levées")}.` : "Aucune réserve à lever.",
    },
    {
      key: "delais",
      label: "Délais tenus",
      max: 20,
      points: Math.round(20 * ratio(f.jobsOnTime, f.jobsWithPlannedEnd)),
      detail: f.jobsWithPlannedEnd
        ? `${pct(f.jobsOnTime, f.jobsWithPlannedEnd)} des chantiers réceptionnés au plus tard ${DELAY_TOLERANCE_DAYS} jours après la fin prévue.`
        : "Aucune date de fin prévue renseignée sur les chantiers réceptionnés.",
    },
    {
      key: "avis",
      label: "Avis des clients vérifiés",
      max: 20,
      points: avg == null ? 0 : Math.round((20 * (avg - 1)) / 4),
      detail:
        avg == null
          ? "Aucun avis déposé par un client de chantier réceptionné."
          : `${avg.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} sur 5, ${plural(f.ratings.length, "avis", "avis")}.`,
    },
    {
      key: "legal",
      label: "Entreprise immatriculée et assurée",
      max: 5,
      points: (f.registered ? 2 : 0) + (f.insured ? 3 : 0),
      detail:
        [f.registered ? "SIRET renseigné" : "SIRET manquant", f.insured ? "assurance décennale déclarée" : "assurance décennale non déclarée"].join(", ") + ".",
    },
  ];
  const verified = f.receivedJobs >= MIN_VERIFIED_JOBS;
  const score = verified ? criteria.reduce((s, c) => s + c.points, 0) : null;
  const level: TrustScore["level"] =
    score == null ? "a_construire" : score >= 85 ? "excellente" : score >= 70 ? "tres_bonne" : score >= 50 ? "bonne" : "en_progres";
  const levelLabel = { a_construire: "En construction", en_progres: "En progrès", bonne: "Bonne", tres_bonne: "Très bonne", excellente: "Excellente" }[level];
  return { score, level, levelLabel, criteria, verifiedJobs: f.receivedJobs };
}

/** Ce qui ferait gagner le plus de points, pour guider l'artisan. */
export function nextSteps(t: TrustScore): string[] {
  const tips: Record<string, string> = {
    volume: "Faites signer le procès-verbal de réception dans l'application à la fin de chaque chantier.",
    qualite: "Une visite de contrôle avant la réception évite la plupart des réserves.",
    reserves: "Levez les réserves en attente et notez-les comme levées sur la fiche du chantier.",
    delais: "Renseignez une date de fin réaliste au planning et réceptionnez dès la fin des travaux.",
    avis: "Demandez un avis au client après chaque réception : le lien est sur la fiche du chantier.",
    legal: "Complétez le SIRET et l'assurance décennale dans Entreprise.",
  };
  return [...t.criteria]
    .filter((c) => c.points < c.max)
    .sort((a, b) => b.max - b.points - (a.max - a.points))
    .slice(0, 3)
    .map((c) => tips[c.key]);
}
