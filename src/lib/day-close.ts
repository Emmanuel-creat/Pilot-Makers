/**
 * Zéro administratif le soir : la liste de ce qui reste à boucler aujourd'hui, à finir avant
 * 18 heures. Chaque point mène directement à l'écran où il se règle ; une journée sans point
 * restant est une journée bouclée.
 */

export const CLOSE_HOUR = 18;
/** Heure du rappel, pour garder le temps de finir avant 18 heures. */
export const REMINDER_MINUTES = 16 * 60 + 30;

export interface DayCloseFacts {
  assignedToday: boolean;
  minutesToday: number;
  draftsTouchedToday: number;
  validatedStagesToInvoice: number;
  receivedJobsWithoutFinalInvoice: number;
  leadsWaiting: number;
  expensesWithoutReceipt: number;
}

export interface DayCloseItem {
  key: string;
  label: string;
  minutes: number;
  href: string;
}

const s = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

/** Points restants, avec une estimation du temps pour les régler. */
export function dayCloseItems(f: DayCloseFacts): DayCloseItem[] {
  const out: DayCloseItem[] = [];
  if (f.assignedToday && f.minutesToday === 0) out.push({ key: "heures", label: "Pointer vos heures de la journée", minutes: 1, href: "/app/pointage" });
  if (f.validatedStagesToInvoice)
    out.push({
      key: "etapes",
      label: `Facturer ${s(f.validatedStagesToInvoice, "étape validée par le client", "étapes validées par les clients")}`,
      minutes: 2 * f.validatedStagesToInvoice,
      href: "/app/factures/zero-impaye",
    });
  if (f.receivedJobsWithoutFinalInvoice)
    out.push({
      key: "solde",
      label: `Émettre la facture de solde de ${s(f.receivedJobsWithoutFinalInvoice, "chantier réceptionné", "chantiers réceptionnés")}`,
      minutes: 3 * f.receivedJobsWithoutFinalInvoice,
      href: "/app/chantiers",
    });
  if (f.leadsWaiting)
    out.push({
      key: "demandes",
      label: `Répondre à ${s(f.leadsWaiting, "demande de devis reçue depuis plus d'un jour", "demandes de devis reçues depuis plus d'un jour")}`,
      minutes: 3 * f.leadsWaiting,
      href: "/app/demandes",
    });
  if (f.draftsTouchedToday)
    out.push({
      key: "brouillons",
      label: `Finir ${s(f.draftsTouchedToday, "devis commencé aujourd'hui", "devis commencés aujourd'hui")}`,
      minutes: 5 * f.draftsTouchedToday,
      href: "/app/devis?status=draft",
    });
  if (f.expensesWithoutReceipt)
    out.push({
      key: "frais",
      label: `Photographier le justificatif de ${s(f.expensesWithoutReceipt, "note de frais", "notes de frais")}`,
      minutes: f.expensesWithoutReceipt,
      href: "/app/frais",
    });
  return out;
}

/** Faut-il envoyer le rappel maintenant ? Entre 16 h 30 et 18 h, heure de Paris, une seule fois par jour. */
export function reminderDue(parisMinutes: number, sentOn: string | null, today: string): boolean {
  return parisMinutes >= REMINDER_MINUTES && parisMinutes < CLOSE_HOUR * 60 && sentOn !== today;
}

export function parisClock(now: Date): { today: string; minutes: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { today: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}
