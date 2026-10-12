import type { CalcResult, LineKind, LineNature } from "@/lib/calc/engine";
import type { ConsumerTerms, ContractPlace } from "./consumer";

export const QUOTE_STATUSES = {
  draft: "Brouillon",
  incomplete: "À compléter",
  ready: "Prêt à envoyer",
  sent: "Envoyé",
  viewed: "Consulté",
  accepted: "Accepté",
  refused: "Refusé",
  expired: "Expiré",
  canceled: "Annulé",
  superseded: "Remplacé",
} as const;
export type QuoteStatus = keyof typeof QUOTE_STATUSES;

/** Statuts dans lesquels le contenu du devis est modifiable directement. */
export const EDITABLE_STATUSES: QuoteStatus[] = ["draft", "incomplete"];
/** Statuts d'un devis émis en attente de réponse. */
export const PENDING_STATUSES: QuoteStatus[] = ["ready", "sent", "viewed"];

export interface DraftLine {
  id: string;
  kind: LineKind;
  catalogItemId: string | null;
  nature: LineNature;
  label: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  unitCost: string;
  discountPercent: string;
  vatPercent: string;
  estimated: boolean;
  estimateNote: string;
}

export interface DraftSection {
  id: string;
  title: string;
  description: string;
  lines: DraftLine[];
}

export interface QuoteDraft {
  id: string;
  number: string | null;
  status: QuoteStatus;
  customerId: string | null;
  title: string;
  description: string;
  site: { line1: string; line2: string; postalCode: string; city: string };
  validityDays: number;
  paymentTerms: string;
  specialConditions: string;
  depositPercent: string;
  estimatedDuration: string;
  estimatedStart: string;
  globalDiscount: string;
  template: string;
  internalNotes: string;
  contractPlace: ContractPlace;
  /** Sous-traitance : TVA autoliquidée par l'entreprise cliente */
  reverseCharge: boolean;
  /** Retenue de garantie en pourcentage du TTC (5 au plus), vide si aucune */
  retentionPercent: string;
  sections: DraftSection[];
  draftRevision: number;
  currentVersion: number;
  acceptedVersion: number | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

/** Photographie figée d'une version émise : seule source du PDF et de la page client. */
export interface QuoteSnapshot {
  schema: 1;
  rulesVersion: string;
  number: string;
  version: number;
  issuedAt: string;
  issueDate: string;
  validUntil: string;
  author: string;
  template: string;
  accentColor: string;
  watermark: boolean;
  org: {
    trade_name: string;
    legal_name: string;
    legal_form: string;
    share_capital: string;
    rcs_rm: string;
    address_line1: string;
    address_line2: string;
    postal_code: string;
    city: string;
    country: string;
    siren: string;
    siret: string;
    vat_number: string;
    phone: string;
    email: string;
    website: string;
    logo_data: string | null;
    signature_data: string | null;
    vat_regime: "normal" | "franchise";
    general_conditions: string;
  };
  customer: {
    id: string;
    type: string;
    name: string;
    contact: string;
    billing_line1: string;
    billing_line2: string;
    billing_postal_code: string;
    billing_city: string;
    billing_country: string;
    email: string;
    phone: string;
    siren: string;
    vat_number: string;
  };
  quote: {
    title: string;
    description: string;
    site: { line1: string; line2: string; postalCode: string; city: string };
    paymentTerms: string;
    specialConditions: string;
    depositPercent: string;
    estimatedDuration: string;
    estimatedStart: string;
    globalDiscount: string;
    reverseCharge?: boolean;
    retentionPercent?: string;
  };
  sections: DraftSection[];
  calc: CalcResult;
  mentions: string[];
  warnings: string[];
  /** Droit de rétractation et attestation de TVA réduite (absent des versions émises avant octobre 2026) */
  consumer?: ConsumerTerms;
  /** Aperçu d'un brouillon : jamais enregistré, marqué comme tel sur le PDF */
  preview?: boolean;
}
