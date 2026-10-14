/**
 * Coordination des corps de métier sur un chantier (fonctions pures) : ordre habituel des lots,
 * contrôle de l'enchaînement des interventions et frise des dates.
 */

export interface Trade {
  key: string;
  label: string;
  /** Rang dans l'enchaînement habituel d'un chantier de rénovation */
  rank: number;
}

export const TRADES: Trade[] = [
  { key: "demolition", label: "Démolition et dépose", rank: 1 },
  { key: "maconnerie", label: "Maçonnerie et gros œuvre", rank: 2 },
  { key: "charpente", label: "Charpente et couverture", rank: 3 },
  { key: "menuiseries_ext", label: "Menuiseries extérieures", rank: 4 },
  { key: "plomberie", label: "Plomberie et chauffage", rank: 5 },
  { key: "electricite", label: "Électricité", rank: 5 },
  { key: "ventilation", label: "Ventilation", rank: 5 },
  { key: "isolation", label: "Isolation et plâtrerie", rank: 6 },
  { key: "chape", label: "Chape et ragréage", rank: 7 },
  { key: "carrelage", label: "Carrelage et faïence", rank: 8 },
  { key: "menuiseries_int", label: "Menuiseries intérieures et agencement", rank: 9 },
  { key: "sols", label: "Sols souples et parquets", rank: 10 },
  { key: "peinture", label: "Peinture et revêtements muraux", rank: 10 },
  { key: "appareillage", label: "Pose des appareils (sanitaires, luminaires)", rank: 11 },
  { key: "nettoyage", label: "Nettoyage de fin de chantier", rank: 12 },
  { key: "autre", label: "Autre intervention", rank: 0 },
];

export const tradeByKey = (key: string) => TRADES.find((t) => t.key === key);

export interface Intervention {
  id: string;
  trade: string;
  company: string;
  startDate: string | null;
  endDate: string | null;
  afterId: string | null;
  note: string;
}

export interface CoordinationIssue {
  id: string;
  kind: "dates" | "predecessor" | "order" | "overlap";
  text: string;
}

const label = (i: Intervention) => tradeByKey(i.trade)?.label ?? i.trade;

/** Enchaînement à vérifier : dates manquantes, prédécesseur pas terminé, ordre inhabituel, chevauchements. */
export function coordinationIssues(list: readonly Intervention[]): CoordinationIssue[] {
  const out: CoordinationIssue[] = [];
  const byId = new Map(list.map((i) => [i.id, i]));
  for (const i of list) {
    if (!i.startDate || !i.endDate) {
      out.push({ id: i.id, kind: "dates", text: `${label(i)} : dates à fixer` });
      continue;
    }
    const before = i.afterId ? byId.get(i.afterId) : undefined;
    if (before?.endDate && i.startDate <= before.endDate) {
      out.push({
        id: i.id,
        kind: "predecessor",
        text: `${label(i)} commence le ${fr(i.startDate)}, avant la fin de ${label(before).toLowerCase()} (${fr(before.endDate)})`,
      });
    }
  }
  const dated = list.filter((i) => i.startDate && i.endDate);
  for (const a of dated) {
    for (const b of dated) {
      if (a.id >= b.id) continue;
      const ra = tradeByKey(a.trade)?.rank ?? 0;
      const rb = tradeByKey(b.trade)?.rank ?? 0;
      if (ra && rb && ra !== rb) {
        const [early, late] = ra < rb ? [a, b] : [b, a];
        if (late.endDate! < early.startDate!) {
          out.push({ id: late.id, kind: "order", text: `${label(late)} est prévu avant ${label(early).toLowerCase()} : l'ordre habituel est inverse` });
          continue;
        }
      }
      if (a.startDate! <= b.endDate! && b.startDate! <= a.endDate! && a.company !== b.company) {
        out.push({ id: b.id, kind: "overlap", text: `${label(a)} et ${label(b).toLowerCase()} se croisent sur le chantier : organisez la coactivité` });
      }
    }
  }
  return out;
}

/** Interventions dans l'ordre habituel des lots, puis par date. */
export function sortInterventions<T extends Intervention>(list: readonly T[]): T[] {
  const rank = (i: T) => tradeByKey(i.trade)?.rank || 99;
  return [...list].sort((a, b) => (a.startDate ?? "9999").localeCompare(b.startDate ?? "9999") || rank(a) - rank(b));
}

/** Position de chaque intervention sur une frise, en pourcentage de la période du chantier. */
export function timeline(list: readonly Intervention[]): { from: string; to: string; bars: Map<string, { left: number; width: number }> } | null {
  const dated = list.filter((i) => i.startDate && i.endDate);
  if (!dated.length) return null;
  const from = dated.map((i) => i.startDate!).sort()[0];
  const to = dated
    .map((i) => i.endDate!)
    .sort()
    .at(-1)!;
  const days = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
  const total = days(from, to) + 1;
  const bars = new Map<string, { left: number; width: number }>();
  for (const i of dated) {
    bars.set(i.id, { left: (days(from, i.startDate!) / total) * 100, width: ((days(i.startDate!, i.endDate!) + 1) / total) * 100 });
  }
  return { from, to, bars };
}

function fr(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** Texte du planning envoyé aux entreprises intervenantes. */
export function planningText(jobTitle: string, address: string, list: readonly Intervention[]): string {
  const lines = sortInterventions(list).map(
    (i) =>
      `- ${label(i)} (${i.company}) : ${i.startDate && i.endDate ? `du ${fr(i.startDate)} au ${fr(i.endDate)}` : "dates à fixer"}${i.note ? `. ${i.note}` : ""}`,
  );
  return `Planning des interventions du chantier « ${jobTitle} »${address ? `, ${address}` : ""} :\n\n${lines.join("\n")}`;
}
