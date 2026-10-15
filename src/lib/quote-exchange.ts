/**
 * Devis ouvert : format d'échange de devis proposé à toute la filière, libre de droits.
 * Un fichier JSON lisible par n'importe quel logiciel : vendeur, client, chantier, lots, lignes,
 * taux de TVA et totaux. Les montants sont des chaînes décimales HT à deux chiffres (« 1250.50 »)
 * pour éviter toute erreur d'arrondi. Les données internes de l'entreprise (coûts, marges, notes
 * internes) n'y figurent jamais.
 */

import { z } from "zod";
import { computeQuote, type LineNature } from "@/lib/calc/engine";
import { draftToCalcInput } from "@/lib/calc/draft";

export const EXCHANGE_FORMAT = {
  name: "Devis ouvert",
  id: "devis-ouvert",
  version: "1.0",
  mediaType: "application/vnd.devis-ouvert+json",
  extension: ".devis.json",
  license: { name: "Licence Ouverte 2.0", url: "https://www.etalab.gouv.fr/licence-ouverte-open-licence/" },
} as const;

export const NATURES: LineNature[] = ["materiau", "main_oeuvre", "deplacement", "sous_traitance", "forfait", "autre"];

const decimal = z.string().regex(/^-?\d+(?:\.\d{1,4})?$/, "Nombre décimal attendu, avec un point (ex. 12.50)");
const text = (max: number) => z.string().max(max).default("");
const address = z
  .object({ line1: text(200), line2: text(200), postalCode: text(20), city: text(120), country: text(60) })
  .partial()
  .default({});

const exchangeLine = z.object({
  label: z.string().trim().min(1, "Chaque ligne a un libellé").max(500),
  description: text(4000),
  nature: z.enum(NATURES as [LineNature, ...LineNature[]]).default("autre"),
  quantity: decimal,
  unit: text(20),
  unitPrice: decimal,
  discountPercent: decimal.optional(),
  vatRate: decimal,
  optional: z.boolean().default(false),
});

const exchangeSection = z.object({
  title: text(200),
  description: text(4000),
  lines: z.array(exchangeLine).max(500),
});

export const exchangeSchema = z.object({
  format: z.literal(EXCHANGE_FORMAT.id, { message: "Ce fichier n'est pas au format Devis ouvert" }),
  version: z.string().regex(/^1\.\d+$/, "Version du format non prise en charge (1.x attendue)"),
  document: z.object({
    number: text(60),
    title: text(200),
    description: text(4000),
    issueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .default(null),
    validityDays: z.number().int().min(1).max(365).nullable().default(null),
    currency: z.literal("EUR").default("EUR"),
    seller: z.object({ name: z.string().max(200), siret: text(20), vatNumber: text(20), address, email: text(200), phone: text(40) }),
    buyer: z
      .object({ name: text(200), address, email: text(200), phone: text(40) })
      .nullable()
      .default(null),
    site: address,
    sections: z.array(exchangeSection).min(1, "Le devis contient au moins un lot").max(200),
    globalDiscountPercent: decimal.optional(),
    terms: z
      .object({ payment: text(2000), depositPercent: decimal.optional(), estimatedDuration: text(200) })
      .partial()
      .default({}),
    totals: z.object({ totalHt: decimal, totalVat: decimal, totalTtc: decimal }),
  }),
});
export type ExchangeDocument = z.infer<typeof exchangeSchema>;

/** Centimes vers chaîne décimale à deux chiffres : 125050 devient « 1250.50 ». */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const a = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/** Valeur saisie dans l'application (« 1 250,5 ») vers chaîne décimale d'échange (« 1250.5 »). */
export function toDecimal(v: string, fallback = "0"): string {
  const t = (v ?? "").replace(/[\s  ]/g, "").replace(",", ".");
  return /^-?\d+(?:\.\d+)?$/.test(t) ? t : fallback;
}

interface SourceLine {
  kind: string;
  label: string;
  description: string;
  nature: LineNature;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountPercent: string;
  vatPercent: string;
  optional?: boolean;
}

export interface ExchangeSource {
  number: string | null;
  title: string;
  description: string;
  issueDate: string | null;
  validityDays: number | null;
  seller: ExchangeDocument["document"]["seller"];
  buyer: ExchangeDocument["document"]["buyer"];
  site: { line1: string; line2: string; postalCode: string; city: string };
  sections: { title: string; description: string; lines: SourceLine[] }[];
  globalDiscount: string;
  paymentTerms: string;
  depositPercent: string;
  estimatedDuration: string;
  totals: { totalHtCents: number; totalVatCents: number; totalTtcCents: number };
}

/** Document d'échange depuis un devis. Les lignes de texte seul et les coûts internes ne sont pas exportés. */
export function toExchange(q: ExchangeSource): ExchangeDocument {
  return {
    format: EXCHANGE_FORMAT.id,
    version: EXCHANGE_FORMAT.version,
    document: {
      number: q.number ?? "",
      title: q.title,
      description: q.description,
      issueDate: q.issueDate,
      validityDays: q.validityDays,
      currency: "EUR",
      seller: q.seller,
      buyer: q.buyer,
      site: { ...q.site, country: "France" },
      sections: q.sections.map((s) => ({
        title: s.title,
        description: s.description,
        lines: s.lines
          .filter((l) => l.kind === "item")
          .map((l) => ({
            label: l.label,
            description: l.description,
            nature: l.nature,
            quantity: toDecimal(l.quantity),
            unit: l.unit,
            unitPrice: toDecimal(l.unitPrice),
            ...(l.discountPercent.trim() ? { discountPercent: toDecimal(l.discountPercent) } : {}),
            vatRate: toDecimal(l.vatPercent),
            optional: !!l.optional,
          })),
      })),
      ...(q.globalDiscount.trim() ? { globalDiscountPercent: toDecimal(q.globalDiscount) } : {}),
      terms: {
        payment: q.paymentTerms,
        ...(q.depositPercent.trim() ? { depositPercent: toDecimal(q.depositPercent) } : {}),
        estimatedDuration: q.estimatedDuration,
      },
      totals: {
        totalHt: centsToDecimal(q.totals.totalHtCents),
        totalVat: centsToDecimal(q.totals.totalVatCents),
        totalTtc: centsToDecimal(q.totals.totalTtcCents),
      },
    },
  };
}

export interface ImportedSection {
  title: string;
  description: string;
  lines: {
    kind: "item";
    nature: LineNature;
    label: string;
    description: string;
    quantity: string;
    unit: string;
    unitPrice: string;
    discountPercent: string;
    vatPercent: string;
    optional: boolean;
  }[];
}

/** Lecture d'un fichier d'échange : contenu prêt à reprendre en brouillon et écarts relevés. */
export function fromExchange(raw: unknown): { doc: ExchangeDocument; sections: ImportedSection[]; warnings: string[] } {
  const p = exchangeSchema.safeParse(raw);
  if (!p.success) {
    const i = p.error.issues[0];
    throw new Error(`${i.path.length ? `${i.path.join(".")} : ` : ""}${i.message}`);
  }
  const doc = p.data;
  const sections: ImportedSection[] = doc.document.sections.map((s) => ({
    title: s.title,
    description: s.description,
    lines: s.lines.map((l) => ({
      kind: "item" as const,
      nature: l.nature,
      label: l.label,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent ?? "",
      vatPercent: l.vatRate,
      optional: l.optional,
    })),
  }));
  const warnings: string[] = [];
  const calc = computeQuote(
    draftToCalcInput(
      {
        globalDiscount: doc.document.globalDiscountPercent ?? "",
        sections: sections.map((s, si) => ({
          id: `s${si}`,
          title: s.title,
          description: s.description,
          lines: s.lines.map((l, li) => ({ ...l, id: `l${si}-${li}`, catalogItemId: null, unitCost: "", estimated: false, estimateNote: "" })),
        })),
      },
      false,
    ),
  );
  const declared = doc.document.totals;
  const diff = (a: number, b: string) => Math.abs(a - Math.round(Number(b) * 100)) > 1;
  if (diff(calc.totalHtCents, declared.totalHt) || diff(calc.totalTtcCents, declared.totalTtc)) {
    warnings.push(
      `Les totaux recalculés (${centsToDecimal(calc.totalHtCents)} HT, ${centsToDecimal(calc.totalTtcCents)} TTC) diffèrent des totaux déclarés (${declared.totalHt} HT, ${declared.totalTtc} TTC) : relisez les lignes.`,
    );
  }
  if (!calc.ok) warnings.push("Certaines lignes sont incomplètes : le devis repris est à compléter.");
  return { doc, sections, warnings };
}

export interface ExchangeValidation {
  valid: boolean;
  /** Erreurs bloquantes, avec le chemin du champ (20 au plus) */
  errors: string[];
  /** Écarts non bloquants : totaux déclarés différents, lignes incomplètes */
  warnings: string[];
  summary: { number: string; seller: string; sections: number; lines: number; totalHt: string; totalTtc: string } | null;
}

/** Validation d'un fichier Devis ouvert par n'importe quel logiciel : toutes les erreurs d'un coup, pas seulement la première. */
export function validateExchange(raw: unknown): ExchangeValidation {
  const p = exchangeSchema.safeParse(raw);
  if (!p.success) {
    const errors = p.error.issues.slice(0, 20).map((i) => `${i.path.length ? `${i.path.join(".")} : ` : ""}${i.message}`);
    if (p.error.issues.length > 20) errors.push(`Et ${p.error.issues.length - 20} autres erreurs.`);
    return { valid: false, errors, warnings: [], summary: null };
  }
  const { doc, sections, warnings } = fromExchange(raw);
  return {
    valid: true,
    errors: [],
    warnings,
    summary: {
      number: doc.document.number,
      seller: doc.document.seller.name,
      sections: sections.length,
      lines: sections.reduce((n, s) => n + s.lines.length, 0),
      totalHt: doc.document.totals.totalHt,
      totalTtc: doc.document.totals.totalTtc,
    },
  };
}

/** Schéma JSON publié pour les éditeurs de logiciels. */
export const JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: `${EXCHANGE_FORMAT.name} ${EXCHANGE_FORMAT.version}`,
  description: "Format ouvert d'échange de devis du bâtiment. Montants HT en chaînes décimales avec un point, taux en pourcentage.",
  type: "object",
  required: ["format", "version", "document"],
  properties: {
    format: { const: EXCHANGE_FORMAT.id },
    version: { type: "string", pattern: "^1\\.\\d+$" },
    document: {
      type: "object",
      required: ["seller", "sections", "totals"],
      properties: {
        number: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        issueDate: { type: ["string", "null"], format: "date" },
        validityDays: { type: ["integer", "null"], minimum: 1, maximum: 365 },
        currency: { const: "EUR" },
        seller: { $ref: "#/$defs/party" },
        buyer: { oneOf: [{ $ref: "#/$defs/party" }, { type: "null" }] },
        site: { $ref: "#/$defs/address" },
        sections: { type: "array", minItems: 1, items: { $ref: "#/$defs/section" } },
        globalDiscountPercent: { $ref: "#/$defs/decimal" },
        terms: {
          type: "object",
          properties: { payment: { type: "string" }, depositPercent: { $ref: "#/$defs/decimal" }, estimatedDuration: { type: "string" } },
        },
        totals: {
          type: "object",
          required: ["totalHt", "totalVat", "totalTtc"],
          properties: { totalHt: { $ref: "#/$defs/decimal" }, totalVat: { $ref: "#/$defs/decimal" }, totalTtc: { $ref: "#/$defs/decimal" } },
        },
      },
    },
  },
  $defs: {
    decimal: { type: "string", pattern: "^-?\\d+(\\.\\d{1,4})?$" },
    address: {
      type: "object",
      properties: {
        line1: { type: "string" },
        line2: { type: "string" },
        postalCode: { type: "string" },
        city: { type: "string" },
        country: { type: "string" },
      },
    },
    party: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        siret: { type: "string" },
        vatNumber: { type: "string" },
        address: { $ref: "#/$defs/address" },
        email: { type: "string" },
        phone: { type: "string" },
      },
    },
    section: {
      type: "object",
      required: ["lines"],
      properties: { title: { type: "string" }, description: { type: "string" }, lines: { type: "array", items: { $ref: "#/$defs/line" } } },
    },
    line: {
      type: "object",
      required: ["label", "quantity", "unitPrice", "vatRate"],
      properties: {
        label: { type: "string" },
        description: { type: "string" },
        nature: { enum: NATURES },
        quantity: { $ref: "#/$defs/decimal" },
        unit: { type: "string" },
        unitPrice: { $ref: "#/$defs/decimal" },
        discountPercent: { $ref: "#/$defs/decimal" },
        vatRate: { $ref: "#/$defs/decimal" },
        optional: { type: "boolean" },
      },
    },
  },
} as const;
