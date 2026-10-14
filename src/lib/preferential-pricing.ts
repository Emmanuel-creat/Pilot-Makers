/**
 * Tarifs préférentiels : apprentis et créateurs d'entreprise.
 *
 * - Apprenti ou élève en formation aux métiers du bâtiment : abonnement gratuit
 *   jusqu'à la fin de la formation, trois ans au plus.
 * - Créateur d'entreprise (moins d'un an d'existence) : moitié prix pendant un an
 *   à compter de l'accord.
 *
 * La demande est vérifiée par l'équipe (numéro de contrat ou INE, date de
 * création au répertoire SIRENE) avant d'être appliquée.
 */

import { z } from "zod";

export const BENEFIT_KINDS = ["apprenti", "createur"] as const;
export type BenefitKind = (typeof BENEFIT_KINDS)[number];

export const BENEFITS: Record<BenefitKind, { label: string; percent: number; summary: string; proof: string }> = {
  apprenti: {
    label: "Apprenti ou élève en formation",
    percent: 100,
    summary: "Abonnement gratuit jusqu'à la fin de la formation, trois ans au plus.",
    proof: "Numéro du contrat d'apprentissage ou numéro INE, vérifié auprès de l'établissement",
  },
  createur: {
    label: "Créateur d'entreprise",
    percent: 50,
    summary: "Moitié prix pendant un an pour une entreprise créée il y a moins d'un an.",
    proof: "Date de création vérifiée dans le répertoire SIRENE à partir du SIREN du profil",
  },
};

const DAY = 86_400_000;
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ");

export const benefitRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("apprenti"),
    school: z.string().trim().min(2, "Indiquez l'établissement de formation").max(200),
    diploma: z.string().trim().min(2, "Indiquez le diplôme préparé").max(200),
    trainingEnd: isoDate,
    reference: z.string().trim().min(3, "Indiquez le numéro du contrat d'apprentissage ou votre numéro INE").max(60),
  }),
  z.object({
    kind: z.literal("createur"),
    creationDate: isoDate,
  }),
]);
export type BenefitRequest = z.infer<typeof benefitRequestSchema>;

const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
const addYears = (iso: string, years: number) => `${Number(iso.slice(0, 4)) + years}${iso.slice(4)}`.replace(/-02-29$/, "-02-28");

/** Vérifie l'éligibilité d'une demande à une date donnée ; renvoie la remise et sa fin. */
export function eligibility(req: BenefitRequest, today: string): { ok: true; percent: number; validUntil: string } | { ok: false; reason: string } {
  if (req.kind === "apprenti") {
    if (req.trainingEnd < today) return { ok: false, reason: "La formation indiquée est déjà terminée" };
    const max = addYears(today, 3);
    return { ok: true, percent: BENEFITS.apprenti.percent, validUntil: req.trainingEnd < max ? req.trainingEnd : max };
  }
  if (req.creationDate > today) return { ok: false, reason: "La date de création ne peut pas être dans le futur" };
  if (addYears(req.creationDate, 1) < today) return { ok: false, reason: "L'entreprise a plus d'un an : le tarif créateur ne s'applique plus" };
  return { ok: true, percent: BENEFITS.createur.percent, validUntil: addDays(addYears(today, 1), -1) };
}

/** Montant après remise, arrondi au centime. */
export function discounted(cents: number, percent: number): number {
  const p = Math.min(Math.max(percent, 0), 100);
  return Math.round((cents * (100 - p)) / 100);
}

/** Remise applicable à une date, ou 0 si la remise n'est pas accordée ou a expiré. */
export function activePercent(b: { status: string; percent: number; validUntil: string | null } | null, today: string): number {
  if (!b || b.status !== "accorde" || !b.validUntil || b.validUntil < today) return 0;
  return b.percent;
}
