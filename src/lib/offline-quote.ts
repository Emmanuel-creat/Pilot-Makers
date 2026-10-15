/**
 * Devis préparé sans réseau (zone blanche, sous-sol) : saisi dans une page autonome gardée par le téléphone,
 * rangé dans le navigateur, puis créé sur le serveur au retour du réseau. La clé évite tout doublon d'envoi.
 */

import { z } from "zod";

export const OFFLINE_OUTBOX = "pm-devis-hors-ligne";

const text = (max: number) => z.string().trim().max(max).default("");

export const offlineLineSchema = z.object({
  label: z.string().trim().min(1, "Désignation manquante").max(500),
  quantity: text(30),
  unit: text(20),
  unitPrice: text(30),
  vatPercent: text(10),
});

export const offlineQuoteSchema = z.object({
  key: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "Clé d'envoi invalide"),
  title: z.string().trim().min(1, "Titre du devis manquant").max(200),
  clientName: text(200),
  clientPhone: text(40),
  clientAddress: text(300),
  note: text(2000),
  lines: z.array(offlineLineSchema).max(200).default([]),
  createdAt: text(40),
});

export type OfflineQuote = z.infer<typeof offlineQuoteSchema>;

/** Description du devis : ce qui a été noté sur place, à rattacher ensuite à une fiche client. */
export function offlineDescription(q: OfflineQuote): string {
  const when = /^\d{4}-\d{2}-\d{2}T/.test(q.createdAt)
    ? new Date(q.createdAt).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "short" })
    : "";
  return [
    `Préparé sans réseau${when ? ` le ${when}` : ""}.`,
    [q.clientName && `Client : ${q.clientName}`, q.clientPhone && `téléphone ${q.clientPhone}`, q.clientAddress && `adresse ${q.clientAddress}`]
      .filter(Boolean)
      .join(", "),
    q.note,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Lecture tolérante de la file d'attente gardée par le navigateur. */
export function readOutbox(raw: string | null): OfflineQuote[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list.flatMap((x) => {
      const p = offlineQuoteSchema.safeParse(x);
      return p.success ? [p.data] : [];
    });
  } catch {
    return [];
  }
}
