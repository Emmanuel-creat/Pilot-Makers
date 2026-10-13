/**
 * Habilitations et formations obligatoires des compagnons, avec leur date de renouvellement.
 *
 * Les durées proposées sont les durées habituelles de recyclage ; l'attestation ou le titre
 * délivré fait foi, et la date de fin reste modifiable.
 */

export const CERT_PRESETS: { name: string; years: number }[] = [
  { name: "Habilitation électrique", years: 3 },
  { name: "Sauveteur secouriste du travail (SST)", years: 2 },
  { name: "Travail en hauteur et port du harnais", years: 3 },
  { name: "Montage et utilisation d'échafaudages", years: 5 },
  { name: "CACES (engins de chantier, nacelles)", years: 5 },
  { name: "AIPR (travaux à proximité des réseaux)", years: 5 },
  { name: "Amiante sous-section 4", years: 3 },
];

/** Délai avant échéance à partir duquel une habilitation est à renouveler. */
export const RENEW_DAYS = 60;
/** Rappel envoyé quand l'échéance est dans ce délai. */
export const CERT_REMINDER_DAYS = 30;

export type CertStatus = "valide" | "a_renouveler" | "expiree" | "permanente";

export const CERT_STATUSES: Record<CertStatus, string> = {
  valide: "Valide",
  a_renouveler: "À renouveler",
  expiree: "Expirée",
  permanente: "Sans échéance",
};

const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));

export function daysUntil(today: string, date: string): number {
  return Math.round((day(date) - day(today)) / 86400000);
}

export function certStatus(validUntil: string | null, today: string): CertStatus {
  if (!validUntil) return "permanente";
  const left = daysUntil(today, validUntil);
  return left < 0 ? "expiree" : left <= RENEW_DAYS ? "a_renouveler" : "valide";
}

/** Échéance habituelle d'une habilitation connue obtenue à cette date, ou "" si inconnue. */
export function suggestedEnd(name: string, obtained: string): string {
  const preset = CERT_PRESETS.find((p) => p.name === name.trim());
  if (!preset || !/^\d{4}-\d{2}-\d{2}$/.test(obtained)) return "";
  const y = +obtained.slice(0, 4) + preset.years;
  const m = +obtained.slice(5, 7) - 1;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const d = Math.min(+obtained.slice(8, 10), last);
  return new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
}
