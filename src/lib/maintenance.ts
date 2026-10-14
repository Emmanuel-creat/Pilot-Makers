/**
 * Entretien préventif : chaque équipement du carnet de logement a une fréquence d'entretien.
 * La prochaine échéance part du dernier entretien, sinon de l'installation, et le client est prévenu avant.
 */

/** Jours avant l'échéance où l'entretien est proposé au client. */
export const NOTICE_DAYS = 30;

export type MaintenanceState = "en_retard" | "bientot" | "a_jour";

export const MAINTENANCE_STATES: Record<MaintenanceState, string> = {
  en_retard: "En retard",
  bientot: "À proposer",
  a_jour: "À jour",
};

/** Ajoute des mois en restant au dernier jour du mois si besoin (31 janvier + 1 mois = 28 ou 29 février). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${String(nm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function nextDue(installDate: string, months: number, lastService: string | null): string {
  return addMonths(lastService && lastService > installDate ? lastService : installDate, months);
}

const days = (from: string, to: string) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);

export function maintenanceState(due: string, today: string): MaintenanceState {
  const left = days(today, due);
  return left < 0 ? "en_retard" : left <= NOTICE_DAYS ? "bientot" : "a_jour";
}

const frDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** E-mail envoyé au client avant l'échéance. */
export function noticeMail(v: { equipment: string; brand: string; address: string; due: string; orgName: string; orgPhone: string }) {
  const what = v.brand ? `${v.equipment} (${v.brand})` : v.equipment;
  return {
    subject: `Entretien de votre ${v.equipment.toLowerCase()} à prévoir`,
    body: [
      "Bonjour,",
      "",
      `L'entretien de votre ${what}, au ${v.address}, est à prévoir avant le ${frDate(v.due)}.`,
      "Un entretien régulier évite les pannes, prolonge la durée de vie de l'équipement et préserve sa garantie.",
      "",
      `Répondez à ce message${v.orgPhone ? ` ou appelez le ${v.orgPhone}` : ""} pour convenir d'un rendez-vous.`,
      "",
      v.orgName,
    ].join("\n"),
  };
}
