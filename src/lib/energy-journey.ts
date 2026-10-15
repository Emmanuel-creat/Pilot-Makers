/**
 * Parcours de rénovation énergétique : du diagnostic au versement de l'aide, dans un seul fil. Les étapes de
 * l'application (devis, signature, chantier, réception, facture) se cochent seules ; celles du dossier d'aide,
 * faites sur le site de l'Anah ou du financeur, se cochent à la main avec leur date. Fonctions pures.
 */

import { z } from "zod";

export const AID_STEPS = {
  aide_compte: {
    label: "Compte du client ouvert sur le site de l'aide",
    help: "Le client (ou son mandataire) crée son espace sur maprimerenov.gouv.fr avec son avis d'imposition.",
  },
  aide_depot: {
    label: "Demande d'aide déposée",
    help: "Avec le devis signé ou non. Elle doit être déposée avant le début des travaux, sinon l'aide est refusée.",
  },
  aide_accord: { label: "Accord de l'aide reçu", help: "Notez le montant accordé : il remplace l'estimation du diagnostic." },
  aide_demande_versement: { label: "Demande de versement envoyée", help: "Avec la facture finale, une fois les travaux terminés." },
  aide_versee: { label: "Aide versée", help: "Notez le montant reçu par le client ou par l'entreprise mandataire." },
} as const;
export type AidStepKey = keyof typeof AID_STEPS;
export const isAidStep = (k: string): k is AidStepKey => k in AID_STEPS;

export interface AidStep {
  on: string;
  amountCents?: number;
  note?: string;
}
export type AidSteps = Partial<Record<AidStepKey, AidStep>>;

export const aidStepSchema = z.object({
  on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"),
  amountCents: z.number().int().min(0).max(100_000_00).optional(),
  note: z.string().trim().max(300).optional(),
});

export function readAidSteps(raw: unknown): AidSteps {
  const out: AidSteps = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw)) {
      const p = aidStepSchema.safeParse(v);
      if (isAidStep(k) && p.success) out[k] = p.data;
    }
  }
  return out;
}

export interface JourneyFacts {
  diagnosedOn: string;
  quoteNumber: string | null;
  quoteIssuedOn: string | null;
  acceptedOn: string | null;
  jobStatus: string | null;
  jobStartOn: string | null;
  receptionOn: string | null;
  finalInvoiceOn: string | null;
  /** Aide estimée par le diagnostic ou le devis, en euros */
  estimatedAid: number;
}

export type StageKey = "diagnostic" | "devis" | AidStepKey | "signature" | "travaux" | "reception" | "facture";

export interface Stage {
  key: StageKey;
  label: string;
  help: string;
  done: boolean;
  on: string | null;
  manual: boolean;
  amountCents?: number;
  note?: string;
}

const ORDER: StageKey[] = [
  "diagnostic",
  "devis",
  "aide_compte",
  "aide_depot",
  "aide_accord",
  "signature",
  "travaux",
  "reception",
  "facture",
  "aide_demande_versement",
  "aide_versee",
];

const AUTO: Record<Exclude<StageKey, AidStepKey>, { label: string; help: string }> = {
  diagnostic: { label: "Diagnostic énergétique fait", help: "Étiquette estimée, travaux classés et aides chiffrées pendant la visite." },
  devis: { label: "Devis des travaux émis", help: "Créé depuis le diagnostic, TVA à 5,5 %, aides et mentions RGE renseignées." },
  signature: { label: "Devis signé par le client", help: "Signature en ligne ou bon pour accord enregistré." },
  travaux: { label: "Travaux commencés", help: "Le chantier passe en cours, ou sa date de début est atteinte." },
  reception: { label: "Chantier réceptionné", help: "Procès-verbal de réception signé." },
  facture: { label: "Facture finale émise", help: "Elle sert à la demande de versement de l'aide." },
};

export function buildJourney(f: JourneyFacts, steps: AidSteps, today: string) {
  const started = f.jobStatus === "en_cours" || f.jobStatus === "termine" || f.jobStatus === "receptionne" || (!!f.jobStartOn && f.jobStartOn <= today);
  const auto: Record<Exclude<StageKey, AidStepKey>, string | null> = {
    diagnostic: f.diagnosedOn,
    devis: f.quoteIssuedOn,
    signature: f.acceptedOn,
    travaux: started ? (f.jobStartOn && f.jobStartOn <= today ? f.jobStartOn : today) : null,
    reception: f.receptionOn,
    facture: f.finalInvoiceOn,
  };
  const stages: Stage[] = ORDER.map((key) => {
    if (isAidStep(key)) {
      const s = steps[key];
      return { key, ...AID_STEPS[key], done: !!s, on: s?.on ?? null, manual: true, amountCents: s?.amountCents, note: s?.note };
    }
    return { key, ...AUTO[key], done: auto[key] != null, on: auto[key], manual: false };
  });
  const alerts: string[] = [];
  if (started && !steps.aide_depot) {
    alerts.push("Les travaux ont commencé sans demande d'aide déposée : l'aide risque d'être refusée. Déposez la demande au plus vite ou prévenez le client.");
  } else if (steps.aide_depot && auto.travaux && steps.aide_depot.on > auto.travaux) {
    alerts.push("La demande d'aide a été déposée après le début des travaux : l'aide risque d'être refusée.");
  }
  if (f.finalInvoiceOn && !steps.aide_demande_versement)
    alerts.push("La facture finale est émise : envoyez la demande de versement de l'aide avec la facture.");
  const next = stages.find((s) => !s.done) ?? null;
  const granted = steps.aide_accord?.amountCents;
  const received = steps.aide_versee?.amountCents;
  return {
    stages,
    done: stages.filter((s) => s.done).length,
    total: stages.length,
    next,
    alerts,
    aid: {
      estimatedCents: Math.round(f.estimatedAid * 100),
      grantedCents: granted ?? null,
      receivedCents: received ?? null,
      /** Écart entre l'aide accordée et l'aide versée, à suivre auprès du financeur */
      gapCents: granted != null && received != null ? granted - received : null,
    },
  };
}
