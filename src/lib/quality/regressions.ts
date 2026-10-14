/**
 * Registre des bogues corrigés. Chaque correction ajoute un test permanent, référencé ici par son
 * fichier et son nom ; scripts/check-regressions.mjs vérifie que chaque test existe toujours.
 */

import data from "./regressions.json";

export interface Regression {
  id: string;
  date: string;
  kind: "produit" | "test";
  title: string;
  fix: string;
  file: string;
  test: string;
}

export const REGRESSIONS = data as Regression[];

export function regressionReport(list: Regression[] = REGRESSIONS) {
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  return {
    total: list.length,
    product: list.filter((r) => r.kind === "produit").length,
    tests: new Set(list.map((r) => `${r.file}::${r.test}`)).size,
    entries: sorted,
  };
}
