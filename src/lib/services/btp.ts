/**
 * Règles propres aux marchés du bâtiment : autoliquidation de la TVA en sous-traitance
 * et retenue de garantie.
 */

/** Mention obligatoire quand le sous-traitant facture sans TVA (article 283-2 nonies du CGI). */
export const REVERSE_CHARGE_MENTION =
  "Autoliquidation : TVA due par le preneur assujetti, article 283-2 nonies du Code général des impôts. Montants indiqués hors TVA.";

/** Taux maximal de la retenue de garantie (loi n° 71-584 du 16 juillet 1971). */
export const MAX_RETENTION_BP = 500;

/** Taux de retenue en points de base (500 = 5 %), ou null si la saisie est invalide. Vide = pas de retenue. */
export function retentionBp(input: string | undefined | null): number | null {
  const t = String(input ?? "")
    .replace("%", "")
    .replace(",", ".")
    .trim();
  if (!t) return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const bp = Math.round(Number(t) * 100);
  return bp <= MAX_RETENTION_BP ? bp : null;
}

export function retentionCents(totalTtcCents: number, bp: number): number {
  return Math.round((totalTtcCents * bp) / 10000);
}

const pct = (bp: number) => (bp / 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " %";

export function retentionMention(bp: number): string {
  return `Retenue de garantie de ${pct(bp)} du montant TTC des travaux, déduite de la facture de solde, remplaçable par une caution bancaire et libérée un an après la réception des travaux, sauf réserves non levées (loi n° 71-584 du 16 juillet 1971).`;
}

export function retentionLabel(bp: number): string {
  return `Retenue de garantie (${pct(bp)} du TTC)`;
}
