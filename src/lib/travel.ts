/**
 * Indemnités de déplacement des ouvriers du bâtiment (fonctions pures).
 *
 * Petits déplacements : le chantier est classé dans une zone concentrique de 10 km, mesurée à vol
 * d'oiseau depuis le siège ou le dépôt de l'entreprise (zones 1 à 5, jusqu'à 50 km). Chaque jour
 * travaillé ouvre droit à l'indemnité de repas, de transport et de trajet de la zone. Au-delà de
 * 50 km, le salarié qui ne peut pas rentrer chaque soir est en grand déplacement : une indemnité
 * journalière couvre le logement et les repas.
 *
 * Les montants sont fixés par les accords régionaux et changent chaque année : l'entreprise saisit
 * ceux qui s'appliquent à elle, rien n'est prérempli.
 */

export const ZONE_WIDTH_KM = 10;
export const ZONE_COUNT = 5;
export const GRAND_DEPLACEMENT_KM = ZONE_WIDTH_KM * ZONE_COUNT;

export interface ZoneRate {
  /** Indemnité de transport par jour, en centimes */
  transport: number;
  /** Indemnité de trajet par jour, en centimes */
  trip: number;
}

export interface TravelRates {
  /** Indemnité de repas (panier) par jour en petit déplacement, en centimes */
  meal: number;
  zones: ZoneRate[];
  /** Indemnité journalière de grand déplacement, en centimes */
  grand: number;
}

export const EMPTY_RATES: TravelRates = { meal: 0, zones: Array.from({ length: ZONE_COUNT }, () => ({ transport: 0, trip: 0 })), grand: 0 };

export function readRates(raw: unknown): TravelRates {
  const o = (raw ?? {}) as Record<string, unknown>;
  const cents = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0);
  const zones = Array.isArray(o.zones) ? o.zones : [];
  return {
    meal: cents(o.meal),
    grand: cents(o.grand),
    zones: Array.from({ length: ZONE_COUNT }, (_, i) => {
      const z = (zones[i] ?? {}) as Record<string, unknown>;
      return { transport: cents(z.transport), trip: cents(z.trip) };
    }),
  };
}

export function hasRates(r: TravelRates): boolean {
  return r.meal > 0 || r.grand > 0 || r.zones.some((z) => z.transport > 0 || z.trip > 0);
}

/** Zone 1 à 5, « grand » au-delà de 50 km, null sans position connue. */
export type Zone = 1 | 2 | 3 | 4 | 5 | "grand";

export function zoneFor(km: number | null): Zone | null {
  if (km === null || !Number.isFinite(km) || km < 0) return null;
  if (km > GRAND_DEPLACEMENT_KM) return "grand";
  return Math.max(1, Math.ceil(km / ZONE_WIDTH_KM)) as Zone;
}

export function zoneLabel(z: Zone): string {
  return z === "grand" ? "Grand déplacement" : `Zone ${z} (${(z - 1) * ZONE_WIDTH_KM} à ${z * ZONE_WIDTH_KM} km)`;
}

export interface DayAllowance {
  meal: number;
  transport: number;
  trip: number;
  grand: number;
  total: number;
}

export function dayAllowance(zone: Zone, rates: TravelRates): DayAllowance {
  if (zone === "grand") return { meal: 0, transport: 0, trip: 0, grand: rates.grand, total: rates.grand };
  const z = rates.zones[zone - 1];
  const out = { meal: rates.meal, transport: z.transport, trip: z.trip, grand: 0 };
  return { ...out, total: out.meal + out.transport + out.trip };
}

export interface MonthAllowance extends DayAllowance {
  /** Jours par zone : index 0 à 4 pour les zones 1 à 5 */
  zoneDays: number[];
  grandDays: number;
  /** Jours travaillés sur un chantier sans position connue, ou sans chantier */
  unknownDays: number;
}

/** Totalise les indemnités d'un salarié sur ses jours travaillés (une zone par jour). */
export function monthAllowance(days: readonly (Zone | null)[], rates: TravelRates): MonthAllowance {
  const out: MonthAllowance = { meal: 0, transport: 0, trip: 0, grand: 0, total: 0, zoneDays: Array(ZONE_COUNT).fill(0), grandDays: 0, unknownDays: 0 };
  for (const z of days) {
    if (z === null) {
      out.unknownDays++;
      continue;
    }
    if (z === "grand") out.grandDays++;
    else out.zoneDays[z - 1]++;
    const d = dayAllowance(z, rates);
    out.meal += d.meal;
    out.transport += d.transport;
    out.trip += d.trip;
    out.grand += d.grand;
    out.total += d.total;
  }
  return out;
}
