/**
 * Chance de signature d'un devis avant l'envoi, tirée de l'historique de l'entreprise : taux d'acceptation
 * par caractéristique (montant, type de client, client déjà servi, options, photos), lissés puis combinés.
 * Chaque caractéristique qui pèse contre le devis donne un conseil quand l'autre choix réussit mieux.
 */

export interface QuoteShape {
  totalCents: number;
  customerType: "particulier" | "pro";
  returning: boolean;
  hasOptions: boolean;
  hasPhotos: boolean;
}

export interface DecidedQuote extends QuoteShape {
  won: boolean;
}

/** Devis décidés minimum pour avancer une estimation. */
export const MIN_HISTORY = 8;
/** Poids du taux global dans le lissage de chaque taux par caractéristique. */
const PRIOR = 5;
/** Atténuation des effets, qui ne sont pas indépendants les uns des autres. */
const DAMPING = 0.7;

type Feature = "montant" | "client" | "fidele" | "options" | "photos";

export interface Factor {
  feature: Feature;
  label: string;
  rate: number;
  effect: number;
  tip: string | null;
}

export interface WinOdds {
  probability: number;
  baseRate: number;
  history: number;
  factors: Factor[];
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Seuils de montant : tiers des devis décidés. */
export function amountBands(amounts: number[]): [number, number] {
  const s = [...amounts].sort((a, b) => a - b);
  if (!s.length) return [0, 0];
  return [s[Math.floor(s.length / 3)], s[Math.floor((2 * s.length) / 3)]];
}

function band(cents: number, [low, high]: [number, number]): "petit" | "moyen" | "gros" {
  return cents < low ? "petit" : cents < high ? "moyen" : "gros";
}

const value = (f: Feature, q: QuoteShape, bands: [number, number]): string =>
  f === "montant"
    ? band(q.totalCents, bands)
    : f === "client"
      ? q.customerType
      : f === "fidele"
        ? String(q.returning)
        : f === "options"
          ? String(q.hasOptions)
          : String(q.hasPhotos);

const LABEL: Record<Feature, (v: string) => string> = {
  montant: (v) => `Montant ${v === "petit" ? "parmi vos plus petits devis" : v === "moyen" ? "dans la moyenne de vos devis" : "parmi vos plus gros devis"}`,
  client: (v) => (v === "pro" ? "Client professionnel" : "Client particulier"),
  fidele: (v) => (v === "true" ? "Client qui vous a déjà fait travailler" : "Nouveau client"),
  options: (v) => (v === "true" ? "Devis avec options" : "Devis sans option"),
  photos: (v) => (v === "true" ? "Devis avec photos" : "Devis sans photo"),
};

const TIP: Partial<Record<Feature, string>> = {
  montant: "Sur vos gros devis, proposez un échelonnement des paiements ou une variante moins chère en option.",
  options: "Ajoutez une ou deux options : vos devis avec options sont plus souvent signés.",
  photos: "Joignez des photos de l'existant ou de réalisations : vos devis avec photos sont plus souvent signés.",
};

export function winOdds(current: QuoteShape, history: readonly DecidedQuote[]): WinOdds | null {
  if (history.length < MIN_HISTORY) return null;
  const won = history.filter((h) => h.won).length;
  const base = (won + 1) / (history.length + 2);
  const bands = amountBands(history.map((h) => h.totalCents));
  const rate = (f: Feature, v: string) => {
    const group = history.filter((h) => value(f, h, bands) === v);
    return (group.filter((h) => h.won).length + PRIOR * base) / (group.length + PRIOR);
  };
  const factors: Factor[] = (["montant", "client", "fidele", "options", "photos"] as Feature[]).map((f) => {
    const v = value(f, current, bands);
    const r = rate(f, v);
    const better = f === "options" || f === "photos" ? (v === "false" ? rate(f, "true") : r) : f === "montant" && v === "gros" ? rate(f, "moyen") : r;
    return { feature: f, label: LABEL[f](v), rate: r, effect: logit(r) - logit(base), tip: TIP[f] && better - r >= 0.1 ? TIP[f]! : null };
  });
  const p = sigmoid(logit(base) + DAMPING * factors.reduce((t, x) => t + x.effect, 0));
  return { probability: Math.min(0.95, Math.max(0.05, p)), baseRate: base, history: history.length, factors };
}
