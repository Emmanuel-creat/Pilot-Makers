/**
 * Données anonymes agrégées, ouvertes à la recherche et aux pouvoirs publics. Seules les
 * entreprises volontaires des repères anonymes y contribuent ; une valeur n'est publiée que si
 * elle résume au moins OPEN_MIN_ORGS entreprises, et jamais sous une forme qui permettrait d'en
 * isoler une : quartiles, médianes et taux uniquement.
 */

import { quantile, regionOf } from "@/lib/benchmark";

export const OPEN_MIN_ORGS = 10;
export const OPEN_LICENSE = { name: "Licence Ouverte 2.0", url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/" };

const round2 = (x: number) => Math.round(x * 100) / 100;
const round1 = (x: number) => Math.round(x * 10) / 10;

function quartiles(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  return { q1: round2(quantile(v, 0.25)), median: round2(quantile(v, 0.5)), q3: round2(quantile(v, 0.75)) };
}

export interface PriceObservation {
  orgId: string;
  postalCode: string;
  name: string;
  unit: string;
  /** Prix unitaire HT en euros */
  price: number;
}

/** Prix HT des prestations de la bibliothèque commune : quartiles par région et pour la France entière. */
export function priceDataset(rows: readonly PriceObservation[], min = OPEN_MIN_ORGS) {
  const groups = new Map<string, { name: string; unit: string; region: string; byOrg: Map<string, number[]> }>();
  const push = (key: string, name: string, unit: string, region: string, org: string, price: number) => {
    const g = groups.get(key) ?? { name, unit, region, byOrg: new Map() };
    (g.byOrg.get(org) ?? g.byOrg.set(org, []).get(org)!).push(price);
    groups.set(key, g);
  };
  for (const r of rows) {
    if (!(r.price > 0)) continue;
    const name = r.name.trim().replace(/\s+/g, " ");
    const unit = r.unit.trim();
    const base = `${name.toLowerCase()}|${unit.toLowerCase()}`;
    push(`${base}|France`, name, unit, "France", r.orgId, r.price);
    const region = regionOf(r.postalCode);
    if (region) push(`${base}|${region}`, name, unit, region, r.orgId, r.price);
  }
  return [...groups.values()]
    .filter((g) => g.byOrg.size >= min)
    .map((g) => ({
      name: g.name,
      unit: g.unit,
      region: g.region,
      companies: g.byOrg.size,
      ...quartiles([...g.byOrg.values()].map((p) => p.reduce((s, x) => s + x, 0) / p.length)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr") || (a.region === "France" ? -1 : b.region === "France" ? 1 : a.region.localeCompare(b.region, "fr")));
}

export interface PaymentObservation {
  orgId: string;
  /** Mois de la facture, AAAA-MM */
  month: string;
  /** Jours entre l'émission de la facture et son règlement */
  days: number;
  late: boolean;
}

/** Délais de paiement des factures réglées : médiane des médianes par entreprise et part payée en retard. */
export function paymentDelayDataset(rows: readonly PaymentObservation[], min = OPEN_MIN_ORGS) {
  const byMonth = new Map<string, PaymentObservation[]>();
  for (const r of rows) (byMonth.get(r.month) ?? byMonth.set(r.month, []).get(r.month)!).push(r);
  return [...byMonth.entries()]
    .map(([month, list]) => {
      const byOrg = new Map<string, number[]>();
      for (const r of list) (byOrg.get(r.orgId) ?? byOrg.set(r.orgId, []).get(r.orgId)!).push(r.days);
      if (byOrg.size < min) return null;
      const medians = [...byOrg.values()].map((d) =>
        quantile(
          [...d].sort((a, b) => a - b),
          0.5,
        ),
      );
      return {
        month,
        companies: byOrg.size,
        medianDays: round1(
          quantile(
            medians.sort((a, b) => a - b),
            0.5,
          ),
        ),
        lateShare: round1((100 * list.filter((r) => r.late).length) / list.length),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.month.localeCompare(b.month));
}

/** Tableau d'objets vers CSV (séparateur point-virgule, comme les tableurs français). */
export function toCsv(rows: readonly Record<string, string | number>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const cell = (v: string | number) => (typeof v === "number" ? String(v).replace(".", ",") : /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [cols.join(";"), ...rows.map((r) => cols.map((c) => cell(r[c])).join(";"))].join("\n") + "\n";
}

export const DATASETS = [
  {
    id: "indice-activite",
    title: "Indice de l'activité artisanale",
    text: "Chiffre d'affaires et commandes en indices base 100, part des devis acceptés, chaque mois.",
    json: "/api/public/indice-activite",
    page: "/indice-activite",
  },
  {
    id: "prix-prestations",
    title: "Prix des prestations courantes",
    text: "Quartiles des prix HT pratiqués pour les prestations de la bibliothèque commune, par région et pour la France.",
    json: "/api/public/donnees/prix-prestations",
    csv: "/api/public/donnees/prix-prestations?format=csv",
  },
  {
    id: "delais-paiement",
    title: "Délais de paiement des clients",
    text: "Délai médian entre facture et règlement, et part des factures réglées après l'échéance, par mois de facture.",
    json: "/api/public/donnees/delais-paiement",
    csv: "/api/public/donnees/delais-paiement?format=csv",
  },
  {
    id: "ouvrages",
    title: "Base ouverte des ouvrages",
    text: "Fiches techniques des ouvrages du bâtiment, rédigées par des artisans, sans prix.",
    json: "/api/public/ouvrages",
    page: "/ouvrages",
  },
] as const;
