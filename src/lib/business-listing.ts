/**
 * Fiche d'établissement en ligne (Google, PagesJaunes, annuaires de la fédération, réseaux sociaux).
 *
 * Les clients trouvent souvent l'artisan par sa fiche avant son site. Une fiche à jour doit reprendre
 * exactement les mêmes informations partout : nom, adresse, téléphone, site, horaires, métier, zone.
 * Ce module prépare ces informations depuis le profil de l'entreprise, signale ce qui manque ou ne
 * concorde pas, et produit les données structurées lues par les moteurs de recherche sur la vitrine.
 */

export const DAYS = [
  { key: "mo", label: "Lundi", schema: "Monday" },
  { key: "tu", label: "Mardi", schema: "Tuesday" },
  { key: "we", label: "Mercredi", schema: "Wednesday" },
  { key: "th", label: "Jeudi", schema: "Thursday" },
  { key: "fr", label: "Vendredi", schema: "Friday" },
  { key: "sa", label: "Samedi", schema: "Saturday" },
  { key: "su", label: "Dimanche", schema: "Sunday" },
] as const;

export type DayKey = (typeof DAYS)[number]["key"];
/** Plages horaires par jour, en « HH:MM » ; jour absent ou liste vide : fermé. */
export type Hours = Partial<Record<DayKey, [string, string][]>>;

/** Délai au-delà duquel les fiches tenues ailleurs sont à revérifier. */
export const LISTING_REVIEW_DAYS = 180;

const hhmm = (h: string, m: string | undefined) => {
  const H = Number(h);
  const M = Number(m || 0);
  if (H > 24 || M > 59 || (H === 24 && M > 0)) return null;
  return `${String(H).padStart(2, "0")}:${String(M).padStart(2, "0")}`;
};

/**
 * Lit les horaires d'un jour tapés librement : « 8h-12h, 14h-18h », « 08:00 à 17:30 », « fermé ».
 * Renvoie les plages, une liste vide si fermé, ou null si le texte n'est pas compris.
 */
export function parseDayHours(input: string): [string, string][] | null {
  const t = input.trim().toLowerCase();
  if (!t || /^(?:ferm[ée]e?|repos|-)$/.test(t)) return [];
  const ranges: [string, string][] = [];
  const re = /(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\s*(?:-|à|a|au|jusqu'à)\s*(\d{1,2})\s*(?:h|:)?\s*(\d{2})?/g;
  let rest = t;
  for (const m of t.matchAll(re)) {
    const from = hhmm(m[1], m[2]);
    const to = hhmm(m[3], m[4]);
    if (!from || !to || from >= to) return null;
    ranges.push([from, to]);
    rest = rest.replace(m[0], "");
  }
  if (!ranges.length || /\d/.test(rest)) return null;
  ranges.sort((a, b) => a[0].localeCompare(b[0]));
  for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) return null;
  return ranges;
}

const short = (t: string) =>
  t
    .replace(/^0(\d)/, "$1")
    .replace(/:00$/, "h")
    .replace(":", "h");

export function formatDayHours(ranges: [string, string][] | undefined): string {
  if (!ranges?.length) return "Fermé";
  return ranges.map(([a, b]) => `${short(a)} - ${short(b)}`).join(", ");
}

export const hasHours = (h: Hours) => DAYS.some((d) => (h[d.key]?.length ?? 0) > 0);

/** Horaires lisibles, jours consécutifs identiques regroupés : « Lundi au vendredi : 8h - 12h, 14h - 18h ». */
export function hoursLines(h: Hours): string[] {
  const lines: string[] = [];
  let i = 0;
  while (i < DAYS.length) {
    const text = formatDayHours(h[DAYS[i].key]);
    let j = i;
    while (j + 1 < DAYS.length && formatDayHours(h[DAYS[j + 1].key]) === text) j++;
    const days =
      i === j ? DAYS[i].label : j === i + 1 ? `${DAYS[i].label} et ${DAYS[j].label.toLowerCase()}` : `${DAYS[i].label} au ${DAYS[j].label.toLowerCase()}`;
    lines.push(`${days} : ${text}`);
    i = j + 1;
  }
  return lines;
}

/** Valide des horaires reçus (base ou formulaire déjà lu) : ne garde que des jours et plages bien formés. */
export function cleanHours(raw: unknown): Hours {
  const out: Hours = {};
  if (!raw || typeof raw !== "object") return out;
  for (const d of DAYS) {
    const v = (raw as Record<string, unknown>)[d.key];
    if (!Array.isArray(v)) continue;
    const ranges = v.filter(
      (r): r is [string, string] => Array.isArray(r) && r.length === 2 && r.every((x) => typeof x === "string" && /^\d{2}:\d{2}$/.test(x)) && r[0] < r[1],
    );
    if (ranges.length) out[d.key] = ranges.slice(0, 4);
  }
  return out;
}

export interface ListingSource {
  name: string;
  trade: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  phone: string;
  email: string;
  website: string;
  siret: string;
  intro: string;
  area: string;
  hours: Hours;
  showcaseUrl: string;
  showcaseEnabled: boolean;
  showPhone: boolean;
  links: { site: string; url: string }[];
  checkedAt: Date | null;
}

export interface ListingField {
  key: string;
  label: string;
  value: string;
}

/** Les informations à recopier, dans l'ordre des formulaires des annuaires. */
export function listingFields(s: ListingSource): ListingField[] {
  const site = s.website ? (/^https?:\/\//.test(s.website) ? s.website : `https://${s.website}`) : s.showcaseEnabled ? s.showcaseUrl : "";
  return [
    { key: "name", label: "Nom de l'établissement", value: s.name },
    { key: "trade", label: "Catégorie (métier)", value: s.trade },
    { key: "address", label: "Adresse", value: [s.addressLine1, s.addressLine2, [s.postalCode, s.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") },
    { key: "area", label: "Zone desservie", value: s.area },
    { key: "phone", label: "Téléphone", value: s.phone },
    { key: "website", label: "Site web", value: site },
    { key: "hours", label: "Horaires", value: hasHours(s.hours) ? hoursLines(s.hours).join("\n") : "" },
    { key: "description", label: "Description", value: s.intro },
  ];
}

/** Texte complet à coller dans une note ou à envoyer à qui tient la fiche. */
export function listingText(fields: ListingField[]): string {
  return fields
    .filter((f) => f.value)
    .map((f) => (f.value.includes("\n") ? `${f.label} :\n${f.value}` : `${f.label} : ${f.value}`))
    .join("\n");
}

export interface ListingCheck {
  level: "manque" | "conseil";
  message: string;
}

const digits = (s: string) => s.replace(/\D/g, "");

export function listingChecks(s: ListingSource, now = new Date()): ListingCheck[] {
  const out: ListingCheck[] = [];
  const miss = (message: string) => out.push({ level: "manque", message });
  const tip = (message: string) => out.push({ level: "conseil", message });
  if (!s.name) miss("Le nom commercial n'est pas renseigné.");
  if (!s.trade) miss("Le métier n'est pas renseigné : il sert de catégorie sur les annuaires.");
  if (!s.addressLine1 || !s.postalCode || !s.city) miss("L'adresse de l'entreprise est incomplète.");
  if (!s.phone) miss("Aucun téléphone : c'est la première chose que cherche un client sur une fiche.");
  else if (digits(s.phone).length !== 10 && !/^\+/.test(s.phone.trim())) miss("Le téléphone ne compte pas 10 chiffres.");
  if (!hasHours(s.hours)) miss("Les horaires ne sont pas renseignés.");
  if (!s.area) tip("Indiquez la zone d'intervention pour apparaître dans les recherches des communes voisines.");
  if (s.intro.length < 80) tip("La description est courte : présentez vos spécialités, votre expérience et vos garanties.");
  if (!s.website && !s.showcaseEnabled) tip("Pas de site web : publiez la vitrine et indiquez son adresse comme site sur vos fiches.");
  if (s.showcaseEnabled && !s.showPhone && s.phone)
    tip("Le téléphone est masqué sur la vitrine alors qu'il figure sur la fiche : les clients verront deux informations différentes.");
  if (!s.links.length) tip("Notez l'adresse de vos fiches (Google, PagesJaunes, autres annuaires) pour les retrouver lors des vérifications.");
  const age = s.checkedAt ? (now.getTime() - s.checkedAt.getTime()) / 86_400_000 : Infinity;
  if (age > LISTING_REVIEW_DAYS)
    tip(s.checkedAt ? "Vos fiches n'ont pas été vérifiées depuis plus de six mois." : "Vérifiez vos fiches en ligne une première fois, puis notez-le ici.");
  return out;
}

/** Date de la prochaine vérification conseillée. */
export function nextReview(checkedAt: Date | null): Date | null {
  return checkedAt ? new Date(checkedAt.getTime() + LISTING_REVIEW_DAYS * 86_400_000) : null;
}

export interface JsonLdInput {
  name: string;
  trade: string;
  intro: string;
  url: string;
  logoUrl: string | null;
  phone: string;
  email: string;
  website: string;
  postalCode: string;
  city: string;
  area: string;
  siret: string;
  hours: Hours;
}

/** Données structurées schema.org de la vitrine (entreprise du bâtiment), lues par les moteurs de recherche. */
export function businessJsonLd(p: JsonLdInput): Record<string, unknown> {
  const opening = DAYS.flatMap((d) =>
    (p.hours[d.key] ?? []).map(([opens, closes]) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: d.schema, opens, closes })),
  );
  const website = p.website ? (/^https?:\/\//.test(p.website) ? p.website : `https://${p.website}`) : "";
  const ld: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: p.name,
    url: p.url,
  };
  if (p.intro) ld.description = p.intro.slice(0, 500);
  if (p.trade) ld.knowsAbout = p.trade;
  if (p.logoUrl) ld.logo = p.logoUrl;
  if (p.phone) ld.telephone = p.phone;
  if (p.email) ld.email = p.email;
  if (website) ld.sameAs = [website];
  if (p.city || p.postalCode) ld.address = { "@type": "PostalAddress", addressLocality: p.city, postalCode: p.postalCode, addressCountry: "FR" };
  if (p.area) ld.areaServed = p.area;
  if (p.siret) ld.identifier = { "@type": "PropertyValue", propertyID: "SIRET", value: digits(p.siret) };
  if (opening.length) ld.openingHoursSpecification = opening;
  return ld;
}

/** JSON à placer dans une balise script : « < » échappé pour ne jamais fermer la balise. */
export const jsonLdScript = (ld: Record<string, unknown>) => JSON.stringify(ld).replace(/</g, "\\u003c");
