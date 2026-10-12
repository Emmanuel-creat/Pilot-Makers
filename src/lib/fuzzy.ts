/**
 * Recherche tolérante : insensible aux accents et à la casse, et qui accepte une
 * faute de frappe par mot (deux pour les mots longs). Partagée par le serveur et l'interface.
 */

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distance d'édition avec transposition de deux lettres voisines (Damerau, version restreinte). */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

const allowed = (len: number) => (len <= 3 ? 0 : len <= 6 ? 1 : 2);

function wordScore(q: string, words: string[]): number {
  let best = 0;
  for (const w of words) {
    if (w === q) return 4;
    if (w.startsWith(q)) best = Math.max(best, 3);
    else if (w.includes(q)) best = Math.max(best, 2);
    else {
      const tol = allowed(q.length);
      if (!tol) continue;
      // Compare au mot entier, ou à son début quand la saisie est plus courte.
      const target = w.length > q.length + tol ? w.slice(0, q.length) : w;
      if (editDistance(q, target, tol) <= tol) best = Math.max(best, 1);
    }
  }
  return best;
}

/** Score de pertinence (0 = ne correspond pas). Chaque mot saisi doit trouver un mot proche. */
export function fuzzyScore(query: string, text: string): number {
  const qs = normalizeText(query).split(" ").filter(Boolean);
  if (!qs.length) return 1;
  const words = normalizeText(text).split(" ").filter(Boolean);
  let total = 0;
  for (const q of qs) {
    const s = wordScore(q, words);
    if (!s) return 0;
    total += s;
  }
  return total;
}

/** Filtre et trie une liste selon la saisie, les meilleurs résultats d'abord, ordre d'origine sinon. */
export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string): T[] {
  if (!normalizeText(query)) return items;
  return items
    .map((it, i) => ({ it, i, s: fuzzyScore(query, text(it)) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);
}
