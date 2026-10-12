/**
 * Échéancier de paiement d'une facture : le reste à payer réparti en plusieurs
 * échéances. La facture émise ne change pas, l'échéancier s'y ajoute.
 * Les encaissements couvrent les échéances dans l'ordre.
 */

export interface ScheduleItem {
  dueDate: string;
  amountCents: number;
}

export interface Schedule {
  /** Montant déjà encaissé ou annulé par avoir quand l'échéancier a été établi */
  base: number;
  items: ScheduleItem[];
  /** Relances envoyées, par échéance */
  reminders?: Record<string, number>;
}

export type InstallmentStatus = "paid" | "partial" | "due" | "overdue";

export const INSTALLMENT_STATUSES: Record<InstallmentStatus, string> = {
  paid: "Réglée",
  partial: "Réglée en partie",
  due: "À venir",
  overdue: "En retard",
};

export const SCHEDULE_MAX = 24;

/** Ajoute des mois à une date AAAA-MM-JJ, en restant sur le dernier jour d'un mois plus court. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** Répartit un montant en échéances égales ; les centimes restants vont sur la première. */
export function splitSchedule(totalCents: number, count: number, firstDate: string, everyMonths = 1): ScheduleItem[] {
  const part = Math.floor(totalCents / count);
  return Array.from({ length: count }, (_, i) => ({
    dueDate: addMonths(firstDate, i * everyMonths),
    amountCents: part + (i === 0 ? totalCents - part * count : 0),
  }));
}

/** Situation de chaque échéance selon le total encaissé ou annulé de la facture. */
export function scheduleState(s: Schedule, settledCents: number, today: string) {
  let covered = Math.max(0, settledCents - s.base);
  return s.items.map((it, index) => {
    const paid = Math.min(it.amountCents, covered);
    covered -= paid;
    const status: InstallmentStatus = paid >= it.amountCents ? "paid" : it.dueDate < today ? "overdue" : paid > 0 ? "partial" : "due";
    return { ...it, index, paidCents: paid, restCents: it.amountCents - paid, status };
  });
}

/** Première échéance non réglée, et ce qui reste dû à cette date (retards compris). */
export function nextInstallment(s: Schedule, settledCents: number, today: string) {
  const state = scheduleState(s, settledCents, today);
  const first = state.find((x) => x.status !== "paid");
  if (!first) return null;
  const owed = state.filter((x) => x.dueDate <= first.dueDate || x.status === "overdue").reduce((t, x) => t + x.restCents, 0);
  return { index: first.index, dueDate: first.dueDate, restCents: first.restCents, owedCents: owed, overdue: first.status === "overdue" };
}

export function scheduleText(s: Schedule, frDate: (iso: string) => string, euros: (c: number) => string) {
  return s.items.map((it, i) => `- échéance ${i + 1} : ${euros(it.amountCents)} au plus tard le ${frDate(it.dueDate)}`).join("\n");
}
