/**
 * Dossier de preuves d'un chantier, pour viser zéro litige : tout ce qui a été signé, photographié
 * et horodaté, rassemblé en un seul fichier avec l'empreinte SHA-256 de chaque pièce. En cas de
 * désaccord, l'artisan remet le dossier à son client, à son assureur ou à un médiateur, qui peut
 * vérifier qu'aucune pièce n'a été modifiée depuis.
 */

export interface EvidenceEvent {
  at: string;
  kind: "devis" | "photo" | "note" | "reception" | "reserve" | "facture" | "paiement";
  text: string;
  /** Empreinte de la pièce jointe correspondante, si elle est dans le dossier */
  sha256?: string;
}

export interface EvidenceCheck {
  key: string;
  label: string;
  ok: boolean;
  hint: string;
}

const QUOTE_EVENTS: Record<string, string> = {
  created: "Devis créé",
  issued: "Devis émis",
  sent: "Devis envoyé au client",
  viewed: "Devis consulté par le client",
  accepted: "Devis accepté",
  refused: "Devis refusé",
  replaced: "Devis remplacé par une nouvelle version",
  canceled: "Devis annulé",
  amendment_created: "Avenant créé",
  reminder: "Relance envoyée",
  expired: "Devis expiré",
};
export const quoteEventLabel = (type: string) => QUOTE_EVENTS[type] ?? null;

export function sortTimeline(events: EvidenceEvent[]): EvidenceEvent[] {
  return [...events].sort((a, b) => a.at.localeCompare(b.at));
}

/** Ce qui protège l'artisan en cas de désaccord, et ce qui manque encore. */
export function evidenceChecks(f: {
  quoteAccepted: boolean;
  photosBefore: number;
  photosAfter: number;
  reception: "sans_reserve" | "avec_reserves" | "refus" | null;
  reservesOpen: number;
  invoices: number;
}): EvidenceCheck[] {
  return [
    {
      key: "devis",
      label: "Devis accepté et signé",
      ok: f.quoteAccepted,
      hint: "Faites accepter le devis en ligne ou signer sur place : la date, l'heure et le nom du signataire sont conservés.",
    },
    {
      key: "avant",
      label: "Photos avant travaux",
      ok: f.photosBefore > 0,
      hint: "Photographiez l'existant avant de commencer : c'est la meilleure preuve de l'état initial.",
    },
    {
      key: "apres",
      label: "Photos en fin de travaux",
      ok: f.photosAfter > 0,
      hint: "Photographiez le résultat avant la réception.",
    },
    {
      key: "reception",
      label: "Procès-verbal de réception signé",
      ok: f.reception === "sans_reserve" || f.reception === "avec_reserves",
      hint: "La réception fait courir les garanties : faites-la signer dans l'application à la fin du chantier.",
    },
    {
      key: "reserves",
      label: "Réserves levées",
      ok: f.reception != null && f.reservesOpen === 0,
      hint: "Levez chaque réserve et notez-la comme levée, avec une photo.",
    },
    {
      key: "facture",
      label: "Facture émise",
      ok: f.invoices > 0,
      hint: "Facturez depuis le devis accepté : la facture reprend exactement ce qui a été signé.",
    },
  ];
}

/** Fichier des empreintes : une ligne par pièce, au format de l'outil sha256sum. */
export function manifest(files: { name: string; sha256: string }[]): string {
  return files.map((f) => `${f.sha256}  ${f.name}`).join("\n") + "\n";
}

export function timelineText(title: string, events: EvidenceEvent[]): string {
  const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "medium" });
  const lines = sortTimeline(events).map((e) => `${fmt.format(new Date(e.at))}  ${e.text}${e.sha256 ? `  [SHA-256 ${e.sha256.slice(0, 16)}...]` : ""}`);
  return [`Chronologie du chantier : ${title}`, "Heures de Paris. Chaque événement est enregistré au moment où il se produit.", "", ...lines, ""].join("\n");
}
