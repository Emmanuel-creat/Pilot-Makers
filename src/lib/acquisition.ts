/**
 * Origine des clients et coût d'acquisition (fonctions pures).
 *
 * Une demande entrante porte sa source (appel, site, recommandation, plateforme...) ; un client
 * hérite de la source de sa première demande. Les dépenses de prospection saisies par source
 * donnent le coût par demande, par client gagné, et ce que chaque euro dépensé a rapporté.
 */

export interface SourceStats {
  leads: number;
  won: number;
  /** Chiffre d'affaires HT facturé aux clients venus par cette source, sur la période */
  revenueCents: number;
  /** Dépenses de prospection saisies pour cette source */
  costCents: number;
}

export interface SourceMetrics extends SourceStats {
  /** Taux de transformation en points de base, null sans demande */
  conversionBp: number | null;
  costPerLeadCents: number | null;
  costPerWonCents: number | null;
  /** Chiffre d'affaires pour un euro dépensé, en centièmes (250 = 2,50 €), null sans dépense */
  returnPer100: number | null;
}

export function metrics(s: SourceStats): SourceMetrics {
  return {
    ...s,
    conversionBp: s.leads ? Math.round((s.won * 10000) / s.leads) : null,
    costPerLeadCents: s.costCents && s.leads ? Math.round(s.costCents / s.leads) : null,
    costPerWonCents: s.costCents && s.won ? Math.round(s.costCents / s.won) : null,
    returnPer100: s.costCents ? Math.round((s.revenueCents * 100) / s.costCents) : null,
  };
}

export function totals(rows: readonly SourceStats[]): SourceMetrics {
  return metrics(
    rows.reduce(
      (t, r) => ({ leads: t.leads + r.leads, won: t.won + r.won, revenueCents: t.revenueCents + r.revenueCents, costCents: t.costCents + r.costCents }),
      {
        leads: 0,
        won: 0,
        revenueCents: 0,
        costCents: 0,
      },
    ),
  );
}

/** Source qui rapporte le plus par euro dépensé, et celle qui coûte le plus par client gagné. */
export function highlights(rows: readonly (SourceMetrics & { source: string })[]): { best: string | null; costliest: string | null } {
  const paid = rows.filter((r) => r.returnPer100 !== null);
  const best = paid.length > 1 ? paid.reduce((a, b) => (b.returnPer100! > a.returnPer100! ? b : a)).source : null;
  const won = rows.filter((r) => r.costPerWonCents !== null);
  const costliest = won.length > 1 ? won.reduce((a, b) => (b.costPerWonCents! > a.costPerWonCents! ? b : a)).source : null;
  return { best, costliest };
}
