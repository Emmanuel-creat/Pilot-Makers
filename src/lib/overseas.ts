/**
 * Chantiers outre-mer : la TVA n'y suit pas les taux de métropole. Guadeloupe, Martinique et La Réunion
 * appliquent 8,5 % et 2,1 % (article 296 du CGI) ; en Guyane et à Mayotte, la TVA n'est provisoirement
 * pas applicable (article 294 du CGI) ; les collectivités d'outre-mer ont leur propre fiscalité.
 */

import type { CalcIssue } from "@/lib/calc/engine";

export type TerritoryRegime = "dom_tva" | "sans_tva" | "collectivite";

export interface Territory {
  name: string;
  regime: TerritoryRegime;
}

const COM_CODES: Record<string, string> = { "97133": "Saint-Barthélemy", "97150": "Saint-Martin" };
const PREFIXES: Record<string, Territory> = {
  "971": { name: "Guadeloupe", regime: "dom_tva" },
  "972": { name: "Martinique", regime: "dom_tva" },
  "973": { name: "Guyane", regime: "sans_tva" },
  "974": { name: "La Réunion", regime: "dom_tva" },
  "975": { name: "Saint-Pierre-et-Miquelon", regime: "collectivite" },
  "976": { name: "Mayotte", regime: "sans_tva" },
  "977": { name: "Saint-Barthélemy", regime: "collectivite" },
  "978": { name: "Saint-Martin", regime: "collectivite" },
  "986": { name: "Wallis-et-Futuna", regime: "collectivite" },
  "987": { name: "Polynésie française", regime: "collectivite" },
  "988": { name: "Nouvelle-Calédonie", regime: "collectivite" },
};

export const DOM_RATES_BP = { normal: 850, reduit: 210 } as const;

/** Territoire d'outre-mer d'un code postal, ou null en métropole et en Corse. */
export function territoryOf(postalCode: string): Territory | null {
  const pc = postalCode.replace(/\s/g, "");
  if (!/^\d{5}$/.test(pc)) return null;
  if (COM_CODES[pc]) return { name: COM_CODES[pc], regime: "collectivite" };
  return PREFIXES[pc.slice(0, 3)] ?? null;
}

const where = (t: Territory) => (/^(La |Saint|Wallis)/.test(t.name) ? `à ${t.name}` : `en ${t.name}`);

/** Avertissements sur les taux de TVA d'un devis dont le chantier est outre-mer. */
export function overseasIssues(postalCode: string, vatBps: number[], vatExempt = false): CalcIssue[] {
  const t = territoryOf(postalCode);
  if (!t || vatExempt) return [];
  const used = [...new Set(vatBps)];
  if (t.regime === "dom_tva") {
    const metro = used.filter((v) => v !== 0 && v !== DOM_RATES_BP.normal && v !== DOM_RATES_BP.reduit);
    if (!metro.length) return [];
    return [
      {
        code: "overseas_vat",
        blocking: false,
        message: `Chantier ${where(t)} : la TVA y est de 8,5 % (taux normal) ou 2,1 % (taux réduit), pas aux taux de métropole. Vérifiez les taux à ${metro.map((v) => `${(v / 100).toLocaleString("fr-FR")} %`).join(", ")}.`,
      },
    ];
  }
  if (!used.some((v) => v > 0)) return [];
  return [
    {
      code: "overseas_vat",
      blocking: false,
      message:
        t.regime === "sans_tva"
          ? `Chantier ${where(t)} : la TVA n'y est pas applicable (article 294 du CGI). Facturez à 0 % avec la mention « TVA non applicable, article 294 du CGI ».`
          : `Chantier ${where(t)} : la TVA française ne s'y applique pas, la collectivité a sa propre fiscalité. Vérifiez les taxes à facturer avec votre comptable.`,
    },
  ];
}
