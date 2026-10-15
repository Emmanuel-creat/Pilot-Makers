/**
 * Bourse aux modèles de devis : un artisan publie l'un de ses modèles, gratuit ou payant ; un confrère l'ajoute à
 * ses propres modèles. Fonctions pures.
 *
 * Seul un artisan expérimenté (un nombre minimal de devis acceptés tenus dans l'application) peut vendre un
 * modèle ; tout le monde peut en céder un gratuitement. Le modèle publié est une copie figée : le coût de revient,
 * les notes internes et les liens vers le catalogue du vendeur sont retirés. Le règlement se fait directement
 * entre entreprises (virement) : le vendeur confirme l'avoir reçu, et le modèle est alors livré à l'acheteur.
 */

import { z } from "zod";

/** Devis acceptés nécessaires pour vendre un modèle */
export const EXPERIENCE_MIN = 10;
/** Prix maximal d'un modèle, en centimes */
export const MAX_PRICE_CENTS = 50000;

export const PURCHASE_STATUS = { a_regler: "En attente de règlement", regle: "Réglé, modèle livré" } as const;

export function parsePrice(v: string): number {
  const t = v.replace(/[\s €]/g, "").replace(",", ".");
  if (!t) return 0;
  if (!/^\d+(?:\.\d{1,2})?$/.test(t)) throw new Error("Prix invalide");
  const cents = Math.round(Number(t) * 100);
  if (cents > MAX_PRICE_CENTS) throw new Error("Prix de 500 euros au plus");
  return cents;
}

export const publishSchema = z.object({
  title: z.string().trim().min(5, "Donnez un titre au modèle (5 caractères au moins)").max(120, "Titre trop long (120 caractères au plus)"),
  summary: z.string().trim().max(1000, "Présentation trop longue (1 000 caractères au plus)").default(""),
  price: z.string().default(""),
});

interface Line {
  kind?: string;
  label?: string;
  unitCost?: string;
  internalNote?: string;
  catalogItemId?: string | null;
  measure?: unknown;
  [k: string]: unknown;
}
interface Section {
  title?: string;
  lines: Line[];
  [k: string]: unknown;
}

/** Copie vendable d'un modèle : sans coût de revient, notes internes ni lien vers le catalogue du vendeur. */
export function sellableData<T extends { sections: Section[] }>(data: T): T {
  return {
    ...data,
    sections: data.sections.map((s) => ({
      ...s,
      lines: s.lines.map(({ measure: _m, ...l }) => ({ ...l, unitCost: "", internalNote: "", catalogItemId: null })),
    })),
  };
}

/** Aperçu public : titres des sections, nombre de lignes chiffrées, quelques intitulés, jamais les prix. */
export function preview(data: { sections: Section[] }, labelsPerSection = 3) {
  return data.sections.map((s) => {
    const items = s.lines.filter((l) => l.kind !== "note");
    return {
      title: s.title || "Sans titre",
      lines: items.length,
      sample: items
        .map((l) => String(l.label ?? "").trim())
        .filter(Boolean)
        .slice(0, labelsPerSection),
    };
  });
}

/** Nom libre parmi les modèles de l'acheteur : « Nom », puis « Nom (2) », « Nom (3) »... */
export function freeName(base: string, existing: readonly string[]): string {
  const taken = new Set(existing.map((n) => n.toLowerCase()));
  const root = base.slice(0, 110);
  if (!taken.has(root.toLowerCase())) return root;
  for (let i = 2; ; i++) {
    const name = `${root} (${i})`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

export const canSell = (acceptedQuotes: number) => acceptedQuotes >= EXPERIENCE_MIN;
