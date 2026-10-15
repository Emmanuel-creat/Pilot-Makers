/**
 * Où va l'argent du client : le prix du devis réparti entre fournitures, main-d'œuvre, déplacements, sous-traitance
 * et TVA, avec le prix de l'heure quand la main-d'œuvre est comptée en heures. Tout vient des lignes du devis
 * lui-même ; la marge de l'entreprise n'est jamais montrée. Fonctions pures.
 */

import type { LineNature } from "@/lib/calc/engine";
import type { QuoteSnapshot } from "@/lib/services/quote-types";

export const BREAKDOWN_LABELS: Record<LineNature, string> = {
  materiau: "Fournitures et matériaux",
  main_oeuvre: "Main-d'œuvre",
  deplacement: "Déplacements",
  sous_traitance: "Travaux confiés à un sous-traitant",
  forfait: "Prestations au forfait",
  autre: "Autres postes",
};

export interface BreakdownPart {
  key: LineNature;
  label: string;
  htCents: number;
  /** Part du total HT, en pour cent arrondi */
  share: number;
}

const HOUR_UNITS = new Set(["h", "heure", "heures", "hr"]);

export function priceBreakdown(s: QuoteSnapshot) {
  const total = s.calc.totalHtCents;
  if (total <= 0) return null;
  const nature = new Map<string, { nature: LineNature; unit: string }>();
  for (const sec of s.sections) for (const l of sec.lines) nature.set(l.id, { nature: l.nature, unit: l.unit });
  const raw = new Map<LineNature, number>();
  let hoursMilli = 0;
  let hoursCents = 0;
  for (const sec of s.calc.sections)
    for (const l of sec.lines) {
      if (l.optional || l.kind !== "item" || !l.netCents) continue;
      const n = nature.get(l.id) ?? { nature: "autre" as LineNature, unit: "" };
      raw.set(n.nature, (raw.get(n.nature) ?? 0) + l.netCents);
      if (n.nature === "main_oeuvre" && HOUR_UNITS.has(n.unit.trim().toLowerCase())) {
        hoursMilli += l.quantityMilli;
        hoursCents += l.netCents;
      }
    }
  const sum = [...raw.values()].reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  // La remise globale se répartit au prorata, l'arrondi restant va au plus gros poste
  const parts: BreakdownPart[] = [...raw.entries()].map(([key, cents]) => ({
    key,
    label: BREAKDOWN_LABELS[key],
    htCents: Math.round((cents * total) / sum),
    share: 0,
  }));
  parts.sort((a, b) => b.htCents - a.htCents || a.key.localeCompare(b.key));
  parts[0].htCents += total - parts.reduce((a, p) => a + p.htCents, 0);
  for (const p of parts) p.share = Math.round((p.htCents / total) * 100);
  const ratio = total / sum;
  return {
    parts,
    totalHtCents: total,
    vatCents: s.calc.totalVatCents,
    totalTtcCents: s.calc.totalTtcCents,
    labour: hoursMilli > 0 ? { hours: Math.round(hoursMilli / 100) / 10, hourlyHtCents: Math.round(((hoursCents * ratio) / hoursMilli) * 1000) } : null,
  };
}
