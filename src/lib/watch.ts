/** Écran montre : alertes courtes (moins de 40 caractères) tirées du résumé du jour, les plus utiles d'abord. */

export interface WatchQuote {
  number: string;
  customer: string;
  viewed: boolean;
  expiresSoon: boolean;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}.` : s);

export function watchAlerts(input: { quotes: WatchQuote[]; running: boolean; plannedJobs: number }, max = 3): string[] {
  const out: string[] = [];
  if (!input.running && input.plannedJobs) out.push(`Pas encore pointé (${input.plannedJobs} chantier${input.plannedJobs > 1 ? "s" : ""})`);
  for (const q of input.quotes.filter((q) => q.viewed)) out.push(`Devis lu : ${cut(q.customer || q.number, 26)}`);
  const expiring = input.quotes.filter((q) => q.expiresSoon).length;
  if (expiring) out.push(`${expiring} devis expire${expiring > 1 ? "nt" : ""} bientôt`);
  return out.slice(0, max);
}

/** Durée affichée sur la montre : « 2 h 05 » ou « 45 min ». */
export function watchDuration(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
