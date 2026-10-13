/**
 * Fusion de deux brouillons de devis modifiés en même temps par deux personnes.
 *
 * On part de la dernière version commune (base), de la mienne (local) et de celle enregistrée par
 * l'autre (distant). Ce qu'une seule personne a changé est repris ; une même zone changée des deux
 * côtés de façon différente est un conflit, et rien n'est fusionné : chacun choisit alors sa version.
 * La granularité est le champ du devis, la section (titre, description, regroupement, variante) et la ligne.
 */

type Rec = Record<string, unknown>;
interface WithId {
  id: string;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export interface MergeResult<T> {
  merged: T | null;
  /** Zones modifiées des deux côtés, en clair (« Titre », « Section Sol », « Ligne Faïence ») */
  conflicts: string[];
}

function mergeValue(base: unknown, local: unknown, remote: unknown, label: string, conflicts: string[]): unknown {
  const lc = !same(base, local);
  const rc = !same(base, remote);
  if (lc && rc && !same(local, remote)) conflicts.push(label);
  return lc ? local : remote;
}

/**
 * Liste d'éléments identifiés (sections, lignes) : ajouts et suppressions de chaque côté repris,
 * éléments communs fusionnés par `item`. L'ordre suit le côté qui l'a changé (le mien si les deux l'ont fait).
 */
function mergeList<E extends WithId>(
  base: readonly E[],
  local: readonly E[],
  remote: readonly E[],
  item: (b: E, l: E, r: E) => E,
  label: (e: E) => string,
  conflicts: string[],
): E[] {
  const B = new Map(base.map((e) => [e.id, e]));
  const Lm = new Map(local.map((e) => [e.id, e]));
  const R = new Map(remote.map((e) => [e.id, e]));
  const common = (list: readonly E[]) => list.filter((e) => B.has(e.id) && Lm.has(e.id) && R.has(e.id)).map((e) => e.id);
  const localMoved = !same(common(base), common(local));
  const spine = localMoved || same(common(base), common(remote)) ? local : remote;
  const other = spine === local ? remote : local;

  const out: E[] = [];
  const place = (e: E) => out.push(e);
  const resolve = (id: string): E | null => {
    const b = B.get(id);
    const l = Lm.get(id);
    const r = R.get(id);
    if (!b) return (l ?? r)!;
    if (l && r) return item(b, l, r);
    // Supprimé d'un côté : conflit si l'autre côté l'a modifié entre-temps.
    const kept = l ?? r;
    if (kept && !same(b, kept)) conflicts.push(label(kept));
    return null;
  };
  const done = new Set<string>();
  const insertOthers = (after: string | null) => {
    // Éléments ajoutés seulement de l'autre côté, placés après leur voisin d'origine.
    other.forEach((e, i) => {
      if (done.has(e.id) || B.has(e.id)) return;
      const prev = i > 0 ? other[i - 1].id : null;
      if (prev !== after) return;
      done.add(e.id);
      place(e);
      insertOthers(e.id);
    });
  };
  insertOthers(null);
  for (const e of spine) {
    done.add(e.id);
    const v = resolve(e.id);
    if (v) place(v);
    insertOthers(e.id);
  }
  const spineIds = spine === local ? Lm : R;
  for (const e of other) {
    // Ajouts de l'autre côté dont le voisin a disparu : en fin de liste.
    if (!done.has(e.id) && !B.has(e.id)) place(e);
    // Supprimé de mon côté de référence mais modifié de l'autre : conflit.
    else if (B.has(e.id) && !spineIds.has(e.id) && !same(B.get(e.id), e)) conflicts.push(label(e));
  }
  return out;
}

interface MLine extends WithId {
  label?: string;
}
interface MSection extends WithId {
  title?: string;
  lines: MLine[];
}

const lineLabel = (l: MLine) => `Ligne « ${l.label || "sans libellé"} »`;
const sectionLabel = (s: MSection) => `Section « ${s.title || "sans titre"} »`;

function mergeSection<S extends MSection>(b: S, l: S, r: S, conflicts: string[]): S {
  const out: Rec = {};
  const keys = new Set([...Object.keys(b), ...Object.keys(l), ...Object.keys(r)]);
  for (const k of keys) {
    if (k === "lines" || k === "id") continue;
    const v = mergeValue((b as Rec)[k], (l as Rec)[k], (r as Rec)[k], `${sectionLabel(l)} : ${k === "title" ? "titre" : "présentation"}`, conflicts);
    if (v !== undefined) out[k] = v;
  }
  const lines = mergeList(b.lines, l.lines, r.lines, (lb, ll, lr) => mergeValue(lb, ll, lr, lineLabel(ll), conflicts) as MLine, lineLabel, conflicts);
  return { ...out, id: l.id, lines } as unknown as S;
}

const FIELD_LABELS: Record<string, string> = {
  customerId: "Client",
  title: "Objet",
  description: "Description",
  site: "Adresse du chantier",
  validityDays: "Durée de validité",
  paymentTerms: "Conditions de paiement",
  specialConditions: "Conditions particulières",
  depositPercent: "Acompte",
  globalDiscount: "Remise globale",
  internalNotes: "Notes internes",
};

/** Fusionne les brouillons ; seuls les champs présents dans `fields` et les sections sont comparés. */
export function mergeDrafts<T extends { sections: MSection[] }>(base: T, local: T, remote: T, fields: readonly (keyof T & string)[]): MergeResult<T> {
  const conflicts: string[] = [];
  const merged: Rec = { ...(remote as unknown as Rec) };
  for (const f of fields) {
    if (f === "sections") continue;
    merged[f] = mergeValue((base as Rec)[f], (local as Rec)[f], (remote as Rec)[f], FIELD_LABELS[f] ?? f, conflicts);
  }
  merged.sections = mergeList(base.sections, local.sections, remote.sections, (b, l, r) => mergeSection(b, l, r, conflicts), sectionLabel, conflicts);
  return conflicts.length ? { merged: null, conflicts } : { merged: merged as T, conflicts };
}
