/**
 * Labels et qualifications de l'entreprise mis en valeur auprès des clients (fonctions pures).
 *
 * Les qualifications RGE ont leur propre suivi (elles conditionnent les aides) ; les autres labels
 * (Qualibat hors RGE, Handibat, Maître artisan...) s'ajoutent ici. Seuls les labels en cours de
 * validité sont montrés sur la vitrine et sur les devis consultés en ligne.
 */

export const LABEL_KINDS = {
  qualibat: "Qualibat",
  qualifelec: "Qualifelec",
  handibat: "Handibat",
  pros_accessibilite: "Les Pros de l'Accessibilité",
  maitre_artisan: "Maître artisan",
  artisan_art: "Artisan d'art",
  eco_artisan: "Eco Artisan",
  autre: "Autre label",
} as const;
export type LabelKind = keyof typeof LABEL_KINDS;
export const LABEL_KIND_CODES = Object.keys(LABEL_KINDS) as [LabelKind, ...LabelKind[]];

/** Délai avant échéance à partir duquel le renouvellement est signalé. */
export const RENEW_WARNING_DAYS = 60;

export interface OrgLabel {
  id: string;
  kind: LabelKind;
  name: string;
  number: string;
  validUntil: string | null;
  shown: boolean;
}

export type LabelState = "permanent" | "valide" | "a_renouveler" | "expire";

export function labelState(validUntil: string | null, today: string): LabelState {
  if (!validUntil) return "permanent";
  if (validUntil < today) return "expire";
  const days = Math.round((Date.parse(validUntil + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 86400000);
  return days <= RENEW_WARNING_DAYS ? "a_renouveler" : "valide";
}

export function labelTitle(l: Pick<OrgLabel, "kind" | "name">): string {
  return l.kind === "autre" ? l.name.trim() : LABEL_KINDS[l.kind] + (l.name.trim() ? ` ${l.name.trim()}` : "");
}

export interface PublicLabel {
  title: string;
  detail: string;
  number: string;
  validUntil: string | null;
  rge: boolean;
}

const fr = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Labels à montrer au client : qualifications RGE valides (avec leurs domaines), puis labels
 * valides et non masqués. Deux entrées identiques (même titre et même numéro) n'apparaissent qu'une fois.
 */
export function publicLabels(
  rge: readonly { body: string; number: string; domains: string[]; valid_until: string }[],
  labels: readonly OrgLabel[],
  today: string,
): PublicLabel[] {
  const out: PublicLabel[] = [];
  const seen = new Set<string>();
  const push = (l: PublicLabel) => {
    const key = `${l.title.toLowerCase()}|${l.number.replace(/\s/g, "").toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(l);
  };
  for (const q of rge) {
    if (q.valid_until < today) continue;
    push({ title: `${q.body} RGE`, detail: q.domains.join(", "), number: q.number, validUntil: q.valid_until, rge: true });
  }
  for (const l of labels) {
    if (!l.shown || labelState(l.validUntil, today) === "expire") continue;
    const title = labelTitle(l);
    if (!title) continue;
    push({ title, detail: l.validUntil ? `Valable jusqu'au ${fr(l.validUntil)}` : "", number: l.number, validUntil: l.validUntil, rge: false });
  }
  return out;
}

/** Phrase d'accroche : « Entreprise RGE, Qualibat et Handibat ». */
export function labelsHeadline(list: readonly PublicLabel[]): string {
  const names = [...new Set(list.map((l) => (l.rge ? "RGE" : l.title)))];
  if (!names.length) return "";
  const text = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
  return `Entreprise ${text}`;
}
