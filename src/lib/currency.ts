/**
 * Devises étrangères : un devis reste établi et dû en euros, mais peut afficher la contre-valeur indicative
 * de son total dans la devise du client, au taux choisi par l'entreprise (ou au taux fixe des francs CFA et CFP).
 */

export const CURRENCIES = {
  CHF: { label: "Franc suisse", fixed: null },
  GBP: { label: "Livre sterling", fixed: null },
  USD: { label: "Dollar américain", fixed: null },
  CAD: { label: "Dollar canadien", fixed: null },
  MAD: { label: "Dirham marocain", fixed: null },
  XOF: { label: "Franc CFA (Afrique de l'Ouest)", fixed: "655.957" },
  XAF: { label: "Franc CFA (Afrique centrale)", fixed: "655.957" },
  XPF: { label: "Franc CFP (Pacifique)", fixed: "119.331742" },
} as const;
export type CurrencyCode = keyof typeof CURRENCIES;

export interface ForeignCurrency {
  code: CurrencyCode;
  /** Unités de la devise pour 1 euro, en texte décimal (point ou virgule) */
  rate: string;
}

export const isCurrency = (v: unknown): v is CurrencyCode => typeof v === "string" && v in CURRENCIES;

/** Taux en nombre, ou null s'il est absent, nul ou déraisonnable. */
export function parseRate(rate: string): number | null {
  const t = rate.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,6})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n < 100_000 ? n : null;
}

/** Devise valide ou null ; les francs CFA et CFP prennent toujours leur parité fixe. */
export function normalizeForeign(v: { code?: unknown; rate?: unknown } | null | undefined): ForeignCurrency | null {
  if (!v || !isCurrency(v.code)) return null;
  const fixed = CURRENCIES[v.code].fixed;
  const rate = fixed ?? String(v.rate ?? "");
  return parseRate(rate) === null ? null : { code: v.code, rate: rate.trim().replace(",", ".") };
}

/** Montant en euros (centimes) converti, en unités de la devise (avec ses décimales usuelles). */
export function convert(cents: number, f: ForeignCurrency): number {
  return (cents / 100) * parseRate(f.rate)!;
}

export function formatForeign(amount: number, code: CurrencyCode): string {
  const digits = code === "XOF" || code === "XAF" || code === "XPF" ? 0 : 2;
  return `${amount.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits }).replace(/ | /g, " ")} ${code}`;
}

/** Mention imprimée sur le devis. */
export function foreignMention(f: ForeignCurrency, totalTtcCents: number, date: string): string {
  const rate = parseRate(f.rate)!.toLocaleString("fr-FR", { maximumFractionDigits: 6 });
  const how = CURRENCIES[f.code].fixed ? "parité fixe" : `taux retenu le ${date}`;
  return (
    `Contre-valeur indicative du total TTC : ${formatForeign(convert(totalTtcCents, f), f.code)} (1 EUR = ${rate} ${f.code}, ${how}). ` +
    "Le prix convenu et dû est celui exprimé en euros ; un éventuel écart de change reste à la charge du client."
  );
}

/** Devise choisie sans taux valable : bloque l'émission plutôt que d'omettre la contre-valeur. */
export function currencyIssues(v: { code?: unknown; rate?: unknown } | null | undefined) {
  if (!v || !isCurrency(v.code) || normalizeForeign(v)) return [];
  return [{ code: "foreign_rate", blocking: true, message: `Contre-valeur en ${v.code} : indiquez le taux, en ${v.code} pour 1 euro (par exemple 0,94).` }];
}

/** Devise conservée en brouillon dès qu'elle est choisie, même si le taux est encore incomplet. */
export function draftForeign(v: { code?: unknown; rate?: unknown } | null | undefined): ForeignCurrency | null {
  if (!v || !isCurrency(v.code)) return null;
  return normalizeForeign(v) ?? { code: v.code, rate: String(v.rate ?? "").slice(0, 20) };
}
