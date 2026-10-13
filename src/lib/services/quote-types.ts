import type { SectionChoice } from "@/lib/calc/variants";
import type { EnergyAid } from "./aid-rules";
import type { SnapshotMedia } from "./quote-media";
import type { SnapshotDocument } from "./datasheets";
import type { Measure } from "@/lib/calc/measure";
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
  /** Commentaire interne, jamais montré au client ni imprimé */
  internalNote?: string;
  /** Pertes et chutes proposées par le catalogue (en %), à ajouter à la quantité mesurée */
  wastePercent?: string;
  /** Proposée en option : hors total tant que le client ne la choisit pas */
  optional?: boolean;
  /** Métré à l'origine de la quantité (cotes, ouvertures déduites) ; jamais imprimé */
  measure?: Measure;
  /** Montant pouvant être négatif : ligne de révision de prix générée à la facturation */
  signed?: boolean;
}

export interface DraftSection {
  id: string;
  /** Regroupement de niveau supérieur (bâtiment, étage, zone) ; les lots consécutifs du même nom forment un sous-total */
  group?: string;
  /** Variante : alternative d'un choix proposé au client (base, confort, premium) */
  choice?: SectionChoice;
  title: string;
  description: string;
  lines: DraftLine[];
}

/** Clause de révision : P = P0 x (fixe + (1 - fixe) x In / I0) */
export interface PriceRevision {
  /** Code de l'index, ex. BT01 */
  index: string;
  /** Mois de référence I0, au format AAAA-MM */
  baseMonth: string;
  /** Part fixe non révisable, en pourcentage (15 par défaut) */
  fixedPercent: string;
}

export interface QuoteAmendment {
  parentId: string;
  index: number;
  parentNumber: string;
  /** Date d'acceptation du devis initial (AAAA-MM-JJ) */
  parentAcceptedOn: string;
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
  /** Mise en page du PDF : tout le détail, récapitulatif par lot en tête, ou un lot par page */
  layout: PdfLayout;
  internalNotes: string;
  contractPlace: ContractPlace;
  /** Sous-traitance : TVA autoliquidée par l'entreprise cliente */
  reverseCharge: boolean;
  /** Retenue de garantie en pourcentage du TTC (5 au plus), vide si aucune */
  retentionPercent: string;
  /** Avenant : devis accepté qu'il complète, absent pour un devis ordinaire */
  amendment?: QuoteAmendment;
  /** Prix révisables selon un index BT, absent ou nul pour des prix fermes */
  priceRevision?: PriceRevision | null;
  /** Aides à la rénovation visées (MaPrimeRénov', CEE, éco-PTZ), absent ou nul sinon */
  energyAid?: EnergyAid | null;
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
  /** Absent des versions émises avant les mises en page : détaillée */
  layout?: PdfLayout;
  accentColor: string;
  /** Police choisie par l'entreprise ; absente pour Helvetica (devis antérieurs inchangés) */
  font?: "times";
  /** Mention libre de l'entreprise en pied de page */
  footerNote?: string;
  /** Photos annotées et croquis joints, dans l'ordre choisi */
  media?: SnapshotMedia[];
  /** Fiches techniques et certificats des articles utilisés, téléchargeables par le client */
  documents?: SnapshotDocument[];
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
    amendment?: Omit<QuoteAmendment, "parentId">;
    priceRevision?: PriceRevision;
    energyAid?: EnergyAid;
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

export type PdfLayout = "detaille" | "synthese" | "lots";
export const PDF_LAYOUTS: Record<PdfLayout, { label: string; hint: string }> = {
  detaille: { label: "Détaillée", hint: "Toutes les lignes, sous-totaux par section" },
  synthese: { label: "Récapitulatif en tête", hint: "Montant de chaque lot en première page, puis le détail" },
  lots: { label: "Un lot par page", hint: "Chaque section sur sa page, récapitulatif des lots avant les totaux" },
};
