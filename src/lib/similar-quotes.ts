/**
 * Devis similaires (fonctions pures) : ressemblance entre deux devis d'après les mots de leurs lignes et leur
 * montant, et prix unitaires comparés à ceux des devis gagnés et perdus.
 */

const STOP = new Set([
  "avec",
  "sans",
  "pour",
  "dans",
  "chez",
  "sous",
  "selon",
  "compris",
  "fourniture",
  "fournitures",
  "pose",
  "posé",
  "mise",
  "place",
  "travaux",
  "ensemble",
  "type",
  "toute",
  "tous",
  "tout",
  "cette",
  "votre",
  "notre",
  "leur",
  "plus",
  "moins",
  "environ",
]);

/** Mots significatifs d'un texte : minuscules, sans accents, quatre lettres au moins, hors mots trop courants. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w))
    .map((w) => (w.length > 5 && w.endsWith("s") ? w.slice(0, -1) : w));
}

export interface QuoteShape {
  title: string;
  labels: string[];
  totalCents: number;
}

export function signature(q: QuoteShape): Set<string> {
  return new Set([...words(q.title), ...q.labels.flatMap(words)]);
}

/**
 * Ressemblance entre 0 et 1 : 70 % pour les mots en commun (indice de Jaccard), 30 % pour la proximité des
 * montants (nulle au-delà d'un rapport de 1 à 4).
 */
export function similarity(a: QuoteShape, b: QuoteShape, sa = signature(a), sb = signature(b)) {
  if (!sa.size || !sb.size) return 0;
  let common = 0;
  for (const w of sa) if (sb.has(w)) common++;
  const jaccard = common / (sa.size + sb.size - common);
  if (!common) return 0;
  const ratio = a.totalCents > 0 && b.totalCents > 0 ? Math.abs(Math.log(a.totalCents / b.totalCents)) / Math.log(4) : 1;
  return Math.round((0.7 * jaccard + 0.3 * Math.max(0, 1 - ratio)) * 100) / 100;
}

/** Clé de rapprochement d'une ligne : mots triés et unité. */
export const lineKey = (label: string, unit: string) => `${[...new Set(words(label))].sort().join(" ")}|${unit.trim().toLowerCase()}`;

export function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export interface PricedLine {
  label: string;
  unit: string;
  unitPriceCents: number;
}

/**
 * Pour chaque ligne du devis, prix unitaire médian des mêmes lignes dans les devis gagnés et perdus, et écart
 * du prix actuel avec celui des devis gagnés, en points de base.
 */
export function comparePrices(current: PricedLine[], won: PricedLine[], lost: PricedLine[]) {
  const group = (ls: PricedLine[]) => {
    const m = new Map<string, number[]>();
    for (const l of ls) {
      if (l.unitPriceCents <= 0) continue;
      const k = lineKey(l.label, l.unit);
      if (k.startsWith("|")) continue;
      m.set(k, [...(m.get(k) ?? []), l.unitPriceCents]);
    }
    return m;
  };
  const w = group(won);
  const lo = group(lost);
  const out: { label: string; unit: string; priceCents: number; wonCents: number | null; lostCents: number | null; gapBp: number | null }[] = [];
  const seen = new Set<string>();
  for (const l of current) {
    const k = lineKey(l.label, l.unit);
    if (seen.has(k) || l.unitPriceCents <= 0 || k.startsWith("|")) continue;
    const wonCents = median(w.get(k) ?? []);
    const lostCents = median(lo.get(k) ?? []);
    if (wonCents == null && lostCents == null) continue;
    seen.add(k);
    out.push({
      label: l.label,
      unit: l.unit,
      priceCents: l.unitPriceCents,
      wonCents,
      lostCents,
      gapBp: wonCents ? Math.round(((l.unitPriceCents - wonCents) * 10000) / wonCents) : null,
    });
  }
  return out;
}
