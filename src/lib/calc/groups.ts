/**
 * Regroupements de lots (bâtiment, étage, zone) : les lots consécutifs qui portent le même nom de regroupement
 * forment un ensemble avec son sous-total. Un même nom plus loin, après un autre regroupement, forme un nouvel ensemble.
 */

export interface GroupRun {
  /** Nom du regroupement ; vide pour des lots hors regroupement */
  group: string;
  /** Index du premier et du dernier lot de l'ensemble */
  start: number;
  end: number;
  /** Somme des sous-totaux HT des lots, en centimes */
  cents: number;
  /** Au moins une ligne chiffrée dans l'ensemble */
  items: boolean;
}

export function groupRuns(
  sections: readonly { id: string; group?: string; lines: readonly { kind: string }[] }[],
  subtotalOf: (id: string) => number,
): GroupRun[] {
  const runs: GroupRun[] = [];
  sections.forEach((sec, i) => {
    const g = (sec.group ?? "").trim();
    const last = runs[runs.length - 1];
    const cents = subtotalOf(sec.id);
    const items = sec.lines.some((l) => l.kind === "item");
    if (last && g && last.group === g) {
      last.end = i;
      last.cents += cents;
      last.items ||= items;
    } else runs.push({ group: g, start: i, end: i, cents, items });
  });
  return runs;
}

/** Ensemble nommé auquel appartient le lot d'index i, s'il y en a un. */
export function runAt(runs: readonly GroupRun[], i: number): GroupRun | undefined {
  return runs.find((r) => r.group && r.start <= i && i <= r.end);
}
