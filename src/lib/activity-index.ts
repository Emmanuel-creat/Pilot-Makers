/**
 * Indice national de l'activité artisanale, publié chaque mois à partir des données agrégées des
 * entreprises qui ont accepté de contribuer aux repères anonymes. Aucune valeur d'entreprise n'est
 * publiée : un mois n'apparaît que s'il repose sur au moins MIN_CONTRIBUTORS entreprises, et seuls
 * des médianes, des taux globaux et des indices sont restitués.
 */

export const MIN_CONTRIBUTORS = 10;
export const PUBLISHED_MONTHS = 13;

export interface OrgMonth {
  orgId: string;
  month: string;
  quotesIssued: number;
  quotesAccepted: number;
  acceptedHtCents: number;
  invoicedHtCents: number;
}

export interface IndexPoint {
  month: string;
  contributors: number;
  /** Indice du chiffre d'affaires facturé médian, base 100 au premier mois publié */
  invoiced: number | null;
  /** Indice des commandes signées (devis acceptés, montant médian), base 100 au premier mois publié */
  orders: number | null;
  /** Part des devis émis acceptés dans le mois, en pourcentage */
  acceptRate: number | null;
}

/** Les n derniers mois complets, du plus ancien au plus récent (« 2026-09 »). */
export function lastMonths(now: Date, n = PUBLISHED_MONTHS): string[] {
  const out: string[] = [];
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.UTC(y, m - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function activityIndex(rows: readonly OrgMonth[], months: readonly string[], min = MIN_CONTRIBUTORS) {
  const byMonth = new Map<string, OrgMonth[]>();
  for (const r of rows) {
    if (r.quotesIssued <= 0 && r.invoicedHtCents === 0) continue;
    const list = byMonth.get(r.month) ?? [];
    list.push(r);
    byMonth.set(r.month, list);
  }
  const raw = months.map((month) => {
    const list = byMonth.get(month) ?? [];
    const contributors = new Set(list.map((r) => r.orgId)).size;
    if (contributors < min) return { month, contributors, invoiced: null, orders: null, acceptRate: null };
    const issued = list.reduce((s, r) => s + r.quotesIssued, 0);
    const accepted = list.reduce((s, r) => s + r.quotesAccepted, 0);
    return {
      month,
      contributors,
      invoiced: median(list.map((r) => r.invoicedHtCents)),
      orders: median(list.map((r) => r.acceptedHtCents)),
      acceptRate: issued ? round1((100 * accepted) / issued) : null,
    };
  });
  const base = raw.find((p) => p.invoiced != null && p.invoiced > 0 && p.orders != null && p.orders > 0) ?? null;
  const points: IndexPoint[] = raw.map((p) => ({
    month: p.month,
    contributors: p.contributors >= min ? p.contributors : 0,
    invoiced: base && p.invoiced != null ? round1((100 * p.invoiced) / base.invoiced!) : null,
    orders: base && p.orders != null ? round1((100 * p.orders) / base.orders!) : null,
    acceptRate: p.acceptRate,
  }));
  const published = points.filter((p) => p.invoiced != null);
  const last = published.at(-1) ?? null;
  const prev = published.at(-2) ?? null;
  return {
    base: base?.month ?? null,
    points,
    latest: last,
    change: last && prev && prev.invoiced ? round1((100 * (last.invoiced! - prev.invoiced)) / prev.invoiced) : null,
  };
}

const MONTHS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const monthLabel = (m: string) => `${MONTHS_FR[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
