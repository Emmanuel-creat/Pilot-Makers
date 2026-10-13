/** Calculs de dates et de chevauchements du planning, sans dépendance serveur. */

export const DAY_MS = 86_400_000;

export function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return new Date(d.getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T12:00:00Z`).getTime() - new Date(`${a}T12:00:00Z`).getTime()) / DAY_MS);
}

/** Lundi de la semaine du jour donné. */
export function mondayOf(iso: string): string {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return addDays(iso, -((day + 6) % 7));
}

export function monthRange(iso: string): { from: string; to: string } {
  const from = `${iso.slice(0, 7)}-01`;
  const next = new Date(`${from}T12:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return { from, to: addDays(next.toISOString().slice(0, 10), -1) };
}

export function range(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay());

export interface Slot {
  id: string;
  jobId: string;
  resourceType: "user" | "vehicle";
  resourceId: string;
  start: string;
  end: string;
}

/** Affectations en conflit : même personne ou même véhicule sur deux chantiers différents des jours communs. */
export function findConflicts(slots: Slot[]): Set<string> {
  const out = new Set<string>();
  const byResource = new Map<string, Slot[]>();
  for (const s of slots) byResource.set(`${s.resourceType}:${s.resourceId}`, [...(byResource.get(`${s.resourceType}:${s.resourceId}`) ?? []), s]);
  for (const list of byResource.values()) {
    list.sort((a, b) => (a.start < b.start ? -1 : 1));
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length && list[j].start <= list[i].end; j++) {
        if (list[i].jobId !== list[j].jobId) {
          out.add(list[i].id);
          out.add(list[j].id);
        }
      }
    }
  }
  return out;
}
