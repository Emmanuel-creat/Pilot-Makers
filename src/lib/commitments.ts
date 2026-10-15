/**
 * Engagements vérifiés : l'artisan choisit des promesses simples faites à ses clients, et l'application vérifie
 * chacune sur ses vrais documents des douze derniers mois. Le taux affiché est celui mesuré, tenu ou non :
 * c'est la transparence qui crée la confiance, pas la promesse. Fonctions pures.
 */

export const COMMITMENTS = {
  acompte: {
    label: "Acompte de 30 % au plus",
    promise: "Vous ne versez jamais plus de 30 % avant le début des travaux.",
    measure: "Pourcentage d'acompte de chaque devis émis.",
  },
  detail: {
    label: "Devis détaillé poste par poste",
    promise: "Chaque devis détaille les fournitures et la main-d'œuvre, sans forfait global unique.",
    measure: "Nombre de postes chiffrés de chaque devis émis (au moins deux).",
  },
  prix: {
    label: "Prix tenu",
    promise: "La facture finale ne dépasse pas le devis signé et ses avenants acceptés.",
    measure: "Facture finale comparée au devis signé et à ses avenants acceptés, à 1 % près.",
  },
  rapidite: {
    label: "Devis remis sous 7 jours",
    promise: "Votre devis vous parvient dans la semaine qui suit votre demande.",
    measure: "Délai entre l'enregistrement de la demande et l'émission du devis.",
  },
} as const;
export type CommitmentKey = keyof typeof COMMITMENTS;
export const COMMITMENT_KEYS = Object.keys(COMMITMENTS) as CommitmentKey[];
export const isCommitment = (k: string): k is CommitmentKey => k in COMMITMENTS;

/** Nombre de cas mesurés en dessous duquel aucun taux n'est publié */
export const MIN_CASES = 3;
export const MAX_DEPOSIT_PERCENT = 30;
export const QUICK_DAYS = 7;
export const PRICE_TOLERANCE = 0.01;

const num = (v: string) => Number(v.replace(",", ".").replace(/\s|%/g, ""));

export function depositKept(depositPercent: string) {
  if (!depositPercent.trim()) return true;
  const n = num(depositPercent);
  return Number.isFinite(n) && n <= MAX_DEPOSIT_PERCENT;
}

export function detailKept(lines: readonly { kind: string; quantity: string; unitPrice: string }[]) {
  const priced = lines.filter((l) => l.kind === "item" && num(l.quantity || "0") > 0 && num(l.unitPrice || "0") > 0);
  return priced.length >= 2;
}

export function priceKept(quotedCents: number, amendmentsCents: number, invoicedCents: number) {
  return invoicedCents <= Math.round((quotedCents + amendmentsCents) * (1 + PRICE_TOLERANCE));
}

export function quickKept(requestedAt: Date, issuedAt: Date) {
  return issuedAt.getTime() - requestedAt.getTime() <= QUICK_DAYS * 86400000;
}

export interface CommitmentCase {
  ref: string;
  kept: boolean;
}

export interface CommitmentMeasure {
  key: CommitmentKey;
  label: string;
  promise: string;
  cases: number;
  kept: number;
  /** Part des cas tenus, en pour cent ; null sous le seuil de cas */
  rate: number | null;
  missed: string[];
}

export function measure(key: CommitmentKey, cases: readonly CommitmentCase[]): CommitmentMeasure {
  const kept = cases.filter((c) => c.kept).length;
  return {
    key,
    label: COMMITMENTS[key].label,
    promise: COMMITMENTS[key].promise,
    cases: cases.length,
    kept,
    rate: cases.length >= MIN_CASES ? Math.round((kept / cases.length) * 100) : null,
    missed: cases.filter((c) => !c.kept).map((c) => c.ref),
  };
}

/** Phrase publique, honnête quel que soit le résultat */
export function publicSentence(m: CommitmentMeasure) {
  if (m.rate == null) return `En cours de vérification (moins de ${MIN_CASES} cas sur douze mois).`;
  return `Tenu dans ${m.rate} % des cas : ${m.kept} sur ${m.cases} sur les douze derniers mois, vérifié sur les documents émis.`;
}

export function readCommitments(raw: unknown): CommitmentKey[] {
  return Array.isArray(raw) ? [...new Set(raw.map(String).filter(isCommitment))] : [];
}
