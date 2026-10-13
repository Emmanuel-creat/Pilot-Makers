/**
 * Variantes d'un même devis (par exemple base, confort, premium) que le client choisit lui-même.
 *
 * Une variante est une section rattachée à un choix nommé (« Finitions ») avec son libellé (« Confort »).
 * Les sections d'un même choix sont des alternatives : la première est comprise dans le total, les autres
 * sont chiffrées à côté, comme des options. À l'acceptation, la variante retenue remplace la première.
 * Un choix n'existe qu'à partir de deux sections ; une section seule garde son contenu tel quel.
 */

export interface SectionChoice {
  /** Nom du choix commun aux alternatives, ex. « Finitions » */
  name: string;
  /** Libellé de cette alternative, ex. « Confort » */
  label: string;
}

interface VLine {
  id: string;
  kind: string;
  optional?: boolean;
}

interface VSection<L extends VLine = VLine> {
  id: string;
  choice?: SectionChoice;
  lines: L[];
}

export interface VariantGroup<S> {
  name: string;
  /** Alternatives dans l'ordre du devis ; la première est comprise dans le total */
  sections: S[];
}

const key = (name: string) => name.trim().toLowerCase();

/** Choix proposés au client : sections regroupées par nom de choix, deux alternatives au moins. */
export function variantGroups<S extends VSection>(sections: readonly S[]): VariantGroup<S>[] {
  const groups = new Map<string, VariantGroup<S>>();
  for (const s of sections) {
    const name = s.choice?.name.trim();
    if (!name) continue;
    const g = groups.get(key(name));
    if (g) g.sections.push(s);
    else groups.set(key(name), { name, sections: [s] });
  }
  return [...groups.values()].filter((g) => g.sections.length > 1);
}

/** Identifiants des sections proposées en variante, hors celle comprise dans le total. */
export function alternativeIds(sections: readonly VSection[]): Set<string> {
  return new Set(variantGroups(sections).flatMap((g) => g.sections.slice(1).map((s) => s.id)));
}

/** Identifiants de toutes les sections faisant partie d'un choix (y compris celle comprise dans le total). */
export function variantSectionIds(sections: readonly VSection[]): Set<string> {
  return new Set(variantGroups(sections).flatMap((g) => g.sections.map((s) => s.id)));
}

/**
 * Marque les lignes selon la variante : celles de la première alternative comptent dans le total,
 * celles des autres sont hors total, comme une option. Une ligne en option dans une variante ne garde
 * pas ce statut : c'est la variante entière qui se choisit.
 */
export function applyVariants<L extends VLine, S extends VSection<L>>(sections: readonly S[]): S[] {
  const members = variantSectionIds(sections);
  if (!members.size) return [...sections];
  const alternatives = alternativeIds(sections);
  return sections.map((s) => {
    if (!members.has(s.id)) return s;
    const off = alternatives.has(s.id);
    return {
      ...s,
      lines: s.lines.map((l) => {
        if (l.kind !== "item") return l;
        if (off) return { ...l, optional: true };
        const { optional: _o, ...rest } = l;
        return rest as L;
      }),
    };
  });
}

/**
 * Sections du devis après le choix du client : pour chaque choix, la variante retenue (ou, sans choix,
 * la première) est gardée et ses lignes comptent dans le total ; les autres alternatives sont retirées.
 */
export function chooseVariants<L extends VLine, S extends VSection<L>>(sections: readonly S[], chosen: readonly string[]): S[] {
  const groups = variantGroups(sections);
  if (!groups.length) return [...sections];
  const picked = new Set(chosen);
  const keep = new Set<string>();
  const drop = new Set<string>();
  for (const g of groups) {
    const winner = g.sections.find((s) => picked.has(s.id)) ?? g.sections[0];
    for (const s of g.sections) (s === winner ? keep : drop).add(s.id);
  }
  return sections
    .filter((s) => !drop.has(s.id))
    .map((s) =>
      keep.has(s.id)
        ? {
            ...s,
            lines: s.lines.map((l) => {
              const { optional: _o, ...rest } = l;
              return rest as L;
            }),
          }
        : s,
    );
}

/** Contrôle un choix : au plus une alternative par choix, toutes proposées. Renvoie les identifiants retenus ou null. */
export function validVariantChoice(sections: readonly VSection[], chosen: readonly string[]): string[] | null {
  const groups = variantGroups(sections);
  const out: string[] = [];
  for (const g of groups) {
    const ids = g.sections.map((s) => s.id).filter((id) => chosen.includes(id));
    if (ids.length > 1) return null;
    out.push(...ids);
  }
  return out;
}
