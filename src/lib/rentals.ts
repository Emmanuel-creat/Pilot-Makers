/**
 * Location de matériel (fonctions pures) : durée facturée, coût d'une location en cours ou rendue,
 * et retards de restitution qui font courir la facture.
 */

export const RENTAL_PERIODS = {
  jour: { label: "par jour", days: 1 },
  semaine: { label: "par semaine", days: 7 },
  mois: { label: "par mois", days: 30 },
} as const;
export type RentalPeriod = keyof typeof RENTAL_PERIODS;

export interface Rental {
  id: string;
  equipment: string;
  renter: string;
  startDate: string;
  endDate: string;
  returnedOn: string | null;
  rateCents: number;
  period: RentalPeriod;
  deliveryCents: number;
  /** Assurance casse et vol, en points de base du loyer */
  insuranceBp: number;
  reference: string;
}

export type RentalState = "a_venir" | "en_cours" | "en_retard" | "rendu";
export const RENTAL_STATES: Record<RentalState, string> = { a_venir: "À venir", en_cours: "En cours", en_retard: "Retour en retard", rendu: "Rendu" };

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000) + 1;

export function rentalState(r: Pick<Rental, "startDate" | "endDate" | "returnedOn">, today: string): RentalState {
  if (r.returnedOn) return "rendu";
  if (today < r.startDate) return "a_venir";
  return today > r.endDate ? "en_retard" : "en_cours";
}

/** Dernier jour facturé : le retour s'il a eu lieu, sinon la fin prévue, ou aujourd'hui si elle est dépassée. */
export function billedUntil(r: Pick<Rental, "endDate" | "returnedOn">, today: string): string {
  if (r.returnedOn) return r.returnedOn;
  return today > r.endDate ? today : r.endDate;
}

export interface RentalCost {
  days: number;
  periods: number;
  rentCents: number;
  insuranceCents: number;
  totalCents: number;
  /** Supplément dû aux jours au-delà de la fin prévue */
  overrunCents: number;
}

function costFor(r: Rental, until: string): Omit<RentalCost, "overrunCents"> {
  const d = Math.max(1, days(r.startDate, until));
  const periods = Math.ceil(d / RENTAL_PERIODS[r.period].days);
  const rentCents = periods * r.rateCents;
  const insuranceCents = Math.round((rentCents * r.insuranceBp) / 10000);
  return { days: d, periods, rentCents, insuranceCents, totalCents: rentCents + insuranceCents + r.deliveryCents };
}

export function rentalCost(r: Rental, today: string): RentalCost {
  const actual = costFor(r, billedUntil(r, today));
  const planned = costFor(r, r.endDate);
  return { ...actual, overrunCents: Math.max(0, actual.totalCents - planned.totalCents) };
}

/** Totaux d'un chantier : coût engagé et supplément dû aux retards. */
export function rentalsTotal(list: readonly Rental[], today: string) {
  return list.reduce(
    (acc, r) => {
      const c = rentalCost(r, today);
      return {
        totalCents: acc.totalCents + c.totalCents,
        overrunCents: acc.overrunCents + c.overrunCents,
        late: acc.late + (rentalState(r, today) === "en_retard" ? 1 : 0),
      };
    },
    { totalCents: 0, overrunCents: 0, late: 0 },
  );
}
