/**
 * Garanties légales après la réception des travaux et libération de la retenue de garantie.
 *
 * La réception sans réserve ou avec réserves fait courir trois garanties (articles 1792 à 1792-6 du
 * Code civil) : parfait achèvement (un an), bon fonctionnement des équipements (deux ans) et
 * décennale (dix ans). La retenue de garantie est libérée un an après la réception, sauf opposition
 * motivée du client (loi n° 71-584 du 16 juillet 1971). Un refus de réception ne fait rien courir.
 */

export type WarrantyKey = "parfait" | "biennale" | "decennale";

export const WARRANTIES: { key: WarrantyKey; label: string; years: number; covers: string }[] = [
  { key: "parfait", label: "Parfait achèvement", years: 1, covers: "Tous les désordres signalés à la réception ou dans l'année qui suit" },
  { key: "biennale", label: "Bon fonctionnement", years: 2, covers: "Équipements dissociables du bâti : volets, robinetterie, chaudière" },
  { key: "decennale", label: "Décennale", years: 10, covers: "Solidité de l'ouvrage et désordres qui le rendent impropre à sa destination" },
];

/** Délai avant la fin d'une garantie à partir duquel elle est signalée comme proche de son terme. */
export const SOON_DAYS = 60;
/** Rappel envoyé quand la garantie de parfait achèvement se termine dans ce délai. */
export const PARFAIT_REMINDER_DAYS = 30;

const DAY = 86400000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(s.slice(0, 10) + "T00:00:00Z");

/** AAAA-MM-JJ plus n années ; un 29 février devient le 28 février d'une année ordinaire. */
export function addYears(date: string, years: number): string {
  const d = parse(date);
  const y = d.getUTCFullYear() + years;
  const m = d.getUTCMonth();
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last))));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parse(to).getTime() - parse(from).getTime()) / DAY);
}

export type WarrantyState = "en_cours" | "bientot" | "terminee";

export interface WarrantyPeriod {
  key: WarrantyKey;
  label: string;
  covers: string;
  /** Dernier jour couvert */
  end: string;
  state: WarrantyState;
  daysLeft: number;
}

/** Les trois garanties d'une réception, avec leur échéance et leur état au jour donné. */
export function warrantyPeriods(receptionDate: string, today: string): WarrantyPeriod[] {
  return WARRANTIES.map((w) => {
    const end = addYears(receptionDate, w.years);
    const daysLeft = daysBetween(today, end);
    const state: WarrantyState = daysLeft < 0 ? "terminee" : daysLeft <= SOON_DAYS ? "bientot" : "en_cours";
    return { key: w.key, label: w.label, covers: w.covers, end, state, daysLeft };
  });
}

export type RetentionState = "aucune" | "retenue" | "liberable" | "liberee";

export const RETENTION_STATES: Record<RetentionState, string> = {
  aucune: "Pas de retenue",
  retenue: "Retenue",
  liberable: "À libérer",
  liberee: "Libérée",
};

export function retentionReleaseDate(receptionDate: string): string {
  return addYears(receptionDate, 1);
}

export function retentionState(input: { cents: number; releasedAt: string | null; receptionDate: string; today: string }): RetentionState {
  if (input.cents <= 0) return "aucune";
  if (input.releasedAt) return "liberee";
  return input.today >= retentionReleaseDate(input.receptionDate) ? "liberable" : "retenue";
}

export type ReminderKey = "parfait_fin" | "retenue_liberable";

/** Rappels à envoyer pour une réception, sans répéter ceux déjà envoyés. */
export function dueReminders(
  input: { receptionDate: string; today: string; retentionCents: number; releasedAt: string | null },
  sent: readonly string[],
): ReminderKey[] {
  const out: ReminderKey[] = [];
  const left = daysBetween(input.today, addYears(input.receptionDate, 1));
  if (left >= 0 && left <= PARFAIT_REMINDER_DAYS && !sent.includes("parfait_fin")) out.push("parfait_fin");
  const rs = retentionState({ cents: input.retentionCents, releasedAt: input.releasedAt, receptionDate: input.receptionDate, today: input.today });
  if (rs === "liberable" && !sent.includes("retenue_liberable")) out.push("retenue_liberable");
  return out;
}
