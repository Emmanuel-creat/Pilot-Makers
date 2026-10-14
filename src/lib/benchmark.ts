/**
 * Repères anonymes entre entreprises volontaires : fourchette de prix locale d'une prestation
 * et comparaison d'indicateurs avec des entreprises semblables. Aucun chiffre n'est montré
 * tant qu'au moins MIN_ORGS entreprises différentes y contribuent.
 */

export const MIN_ORGS = 5;

const REGIONS: Record<string, string> = {};
const add = (name: string, depts: string) => depts.split(" ").forEach((d) => (REGIONS[d] = name));
add("Auvergne-Rhône-Alpes", "01 03 07 15 26 38 42 43 63 69 73 74");
add("Bourgogne-Franche-Comté", "21 25 39 58 70 71 89 90");
add("Bretagne", "22 29 35 56");
add("Centre-Val de Loire", "18 28 36 37 41 45");
add("Corse", "2A 2B 20");
add("Grand Est", "08 10 51 52 54 55 57 67 68 88");
add("Hauts-de-France", "02 59 60 62 80");
add("Île-de-France", "75 77 78 91 92 93 94 95");
add("Normandie", "14 27 50 61 76");
add("Nouvelle-Aquitaine", "16 17 19 23 24 33 40 47 64 79 86 87");
add("Occitanie", "09 11 12 30 31 32 34 46 48 65 66 81 82");
add("Pays de la Loire", "44 49 53 72 85");
add("Provence-Alpes-Côte d'Azur", "04 05 06 13 83 84");
add("Outre-mer", "971 972 973 974 976");

/** Région d'un code postal français, ou chaîne vide si inconnue. */
export function regionOf(postalCode: string): string {
  const pc = postalCode.replace(/\s/g, "");
  if (!/^\d{5}$/.test(pc)) return "";
  if (pc.startsWith("97")) return REGIONS[pc.slice(0, 3)] ?? "";
  return REGIONS[pc.slice(0, 2)] ?? "";
}

/** Clé de comparaison d'un article entre entreprises : code-barres, sinon prestation de la bibliothèque commune. */
export function itemKey(i: { ean: string; source: string; name: string; unit: string }): string | null {
  const unit = i.unit.trim().toLowerCase();
  if (i.ean) return `ean:${i.ean}:${unit}`;
  if (i.source === "library") return `lib:${i.name.trim().toLowerCase().replace(/\s+/g, " ")}:${unit}`;
  return null;
}

export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export interface Band {
  low: number;
  median: number;
  high: number;
  orgs: number;
}

/** Fourchette (quartiles) des valeurs de chaque entreprise ; null sous le seuil d'anonymat. */
export function band(perOrg: number[]): Band | null {
  const v = perOrg.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < MIN_ORGS) return null;
  return { low: quantile(v, 0.25), median: quantile(v, 0.5), high: quantile(v, 0.75), orgs: v.length };
}

export type Position = "bas" | "dans" | "haut";

export function position(value: number, b: Band): Position {
  return value < b.low ? "bas" : value > b.high ? "haut" : "dans";
}

/** Effectif ramené à une tranche, pour comparer des entreprises de taille voisine. */
export function sizeBand(people: number): string {
  return people <= 1 ? "1 personne" : people <= 5 ? "2 à 5 personnes" : people <= 20 ? "6 à 20 personnes" : "plus de 20 personnes";
}

export interface OrgProfile {
  id: string;
  trade: string;
  region: string;
  size: string;
}

/**
 * Groupe de comparaison : même métier, même région et même taille si assez d'entreprises,
 * puis en relâchant la taille, la région, puis le métier.
 */
export function peerGroup(me: OrgProfile, all: OrgProfile[]): { label: string; ids: string[] } {
  const trade = me.trade.trim().toLowerCase();
  const steps: { label: string; ok: (o: OrgProfile) => boolean }[] = [
    { label: "même métier, même région, taille voisine", ok: (o) => o.trade.trim().toLowerCase() === trade && o.region === me.region && o.size === me.size },
    { label: "même métier, même région", ok: (o) => o.trade.trim().toLowerCase() === trade && o.region === me.region },
    { label: "même métier, toute la France", ok: (o) => o.trade.trim().toLowerCase() === trade },
    { label: "toutes les entreprises participantes", ok: () => true },
  ];
  for (const s of steps) {
    const ids = all.filter(s.ok).map((o) => o.id);
    if (ids.length >= MIN_ORGS) return { label: s.label, ids };
  }
  return { label: steps[steps.length - 1].label, ids: all.map((o) => o.id) };
}
