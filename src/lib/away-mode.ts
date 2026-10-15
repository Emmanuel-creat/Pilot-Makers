/**
 * Mode absence : l'artisan part plusieurs semaines, les relances et le suivi tournent seuls, les clients sont
 * prévenus de sa date de retour et les urgences sont transmises à un contact de secours. Fonctions pures.
 */

import { z } from "zod";

/** Durée maximale d'une absence, en jours */
export const MAX_AWAY_DAYS = 92;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide");

export const awaySchema = z
  .object({
    from: date,
    to: date,
    message: z.string().trim().max(600, "Message trop long (600 caractères au plus)").default(""),
    backupName: z.string().trim().max(120).default(""),
    backupPhone: z.string().trim().max(30).default(""),
    backupEmail: z.string().trim().max(254).default(""),
  })
  .refine((v) => v.to >= v.from, { message: "La date de retour doit suivre la date de départ" })
  .refine((v) => daysBetween(v.from, v.to) <= MAX_AWAY_DAYS, { message: `Une absence dure ${MAX_AWAY_DAYS} jours au plus` })
  .refine((v) => !v.backupName || v.backupPhone || v.backupEmail, { message: "Indiquez le téléphone ou l'e-mail du contact de secours" });
export type AwayInput = z.infer<typeof awaySchema>;

export interface AwaySettings {
  from: string | null;
  to: string | null;
  message: string;
  backupName: string;
  backupPhone: string;
  backupEmail: string;
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

export const isAway = (s: Pick<AwaySettings, "from" | "to">, today: string) => !!s.from && !!s.to && s.from <= today && today <= s.to;
export const isPlanned = (s: Pick<AwaySettings, "from" | "to">, today: string) => !!s.from && !!s.to && today < s.from;

/** Jour qui suit la fin de l'absence */
export function returnDate(to: string) {
  const d = new Date(`${to}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const frDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

/** Message aux clients : celui de l'artisan, ou un message par défaut avec la date de retour */
export function clientMessage(s: AwaySettings, company: string) {
  if (s.message) return s.message;
  return `${company || "L'entreprise"} est absente jusqu'au ${frDate(s.to!)}. Votre demande est bien enregistrée et sera traitée dès le ${frDate(returnDate(s.to!))}.`;
}

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mots qui signalent une urgence : dégâts en cours, sécurité, logement privé d'un équipement vital */
export const URGENT_PATTERNS = [
  /\bfuites?\b/,
  /\binond/,
  /degats? des eaux/,
  /\burgen(t|te|ce)\b/,
  /\bpanne\b/,
  /plus de (chauffage|courant|electricite|eau chaude|eau)\b/,
  /odeur de gaz/,
  /court[- ]circuit/,
  /\beffondr/,
  /\binfiltration/,
  /\bcoupure\b/,
];

export const isUrgent = (text: string) => {
  const t = fold(text);
  return URGENT_PATTERNS.some((p) => p.test(t));
};

export interface ReadinessFacts {
  quoteReminders: boolean;
  invoiceReminders: boolean;
  backup: boolean;
  jobsDuring: number;
  invoicesDueDuring: number;
  chequesPending: number;
  draftQuotes: number;
}

export interface ReadinessItem {
  key: string;
  ok: boolean;
  label: string;
  detail: string;
  href: string;
}

/** Ce qui tournera seul pendant l'absence, et ce qu'il faut régler avant de partir */
export function readiness(f: ReadinessFacts): ReadinessItem[] {
  const n = (v: number, one: string, many: string) => `${v} ${v > 1 ? many : one}`;
  return [
    {
      key: "relances-devis",
      ok: f.quoteReminders,
      label: "Relances des devis envoyés",
      detail: f.quoteReminders
        ? "Actives : les devis sans réponse sont relancés seuls."
        : "Désactivées : activez-les pour que les devis en attente soient relancés.",
      href: "/app/entreprise?onglet=relances",
    },
    {
      key: "relances-factures",
      ok: f.invoiceReminders,
      label: "Relances des factures",
      detail: f.invoiceReminders
        ? `Actives : ${n(f.invoicesDueDuring, "facture arrive", "factures arrivent")} à échéance pendant l'absence et ${f.invoicesDueDuring > 1 ? "seront relancées" : "sera relancée"} si besoin.`
        : `Désactivées : ${n(f.invoicesDueDuring, "facture arrive", "factures arrivent")} à échéance pendant l'absence sans relance.`,
      href: "/app/entreprise?onglet=factures",
    },
    {
      key: "secours",
      ok: f.backup,
      label: "Contact de secours",
      detail: f.backup ? "Les demandes urgentes lui sont transmises." : "Aucun : les urgences attendront votre retour.",
      href: "/app/absence",
    },
    {
      key: "chantiers",
      ok: f.jobsDuring === 0,
      label: "Chantiers prévus pendant l'absence",
      detail: f.jobsDuring ? `${n(f.jobsDuring, "chantier est planifié", "chantiers sont planifiés")} : confiez-les à l'équipe ou décalez-les.` : "Aucun.",
      href: "/app/planning",
    },
    {
      key: "cheques",
      ok: f.chequesPending === 0,
      label: "Chèques à remettre",
      detail: f.chequesPending ? `${n(f.chequesPending, "chèque attend", "chèques attendent")} : remettez-les avant de partir.` : "Aucun.",
      href: "/app/factures/remises",
    },
    {
      key: "brouillons",
      ok: f.draftQuotes === 0,
      label: "Devis en brouillon",
      detail: f.draftQuotes
        ? `${n(f.draftQuotes, "devis n'est pas envoyé", "devis ne sont pas envoyés")} : envoyez-les pour qu'ils soient relancés.`
        : "Aucun.",
      href: "/app/devis",
    },
  ];
}
