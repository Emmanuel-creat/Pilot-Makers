/**
 * Copie traduite du devis pour un client étranger : les textes fixes du document (titres, colonnes,
 * totaux, zone d'acceptation) sont traduits ; les désignations et conditions restent telles que
 * l'entreprise les a écrites, et les mentions légales restent en français. Seule la version
 * française émise fait foi : la copie le dit en tête de document.
 */

export type Lang = "fr" | "en" | "es" | "pt" | "de";

export const LANGS: Record<Exclude<Lang, "fr">, string> = {
  en: "English",
  es: "Español",
  pt: "Português",
  de: "Deutsch",
};

export function isLang(v: unknown): v is Lang {
  return v === "fr" || (typeof v === "string" && v in LANGS);
}

const T = {
  quote: { fr: "DEVIS", en: "QUOTE", es: "PRESUPUESTO", pt: "ORÇAMENTO", de: "ANGEBOT" },
  quoteWord: { fr: "Devis", en: "Quote", es: "Presupuesto", pt: "Orçamento", de: "Angebot" },
  amendment: { fr: "AVENANT N°", en: "AMENDMENT NO.", es: "ADENDA N.º", pt: "ADITAMENTO N.º", de: "NACHTRAG NR." },
  number: { fr: "N°", en: "No.", es: "N.º", pt: "N.º", de: "Nr." },
  version: { fr: "version", en: "version", es: "versión", pt: "versão", de: "Version" },
  toQuote: { fr: "Au devis n°", en: "To quote no.", es: "Del presupuesto n.º", pt: "Do orçamento n.º", de: "Zum Angebot Nr." },
  date: { fr: "Date", en: "Date", es: "Fecha", pt: "Data", de: "Datum" },
  validUntil: { fr: "Valable jusqu'au", en: "Valid until", es: "Válido hasta", pt: "Válido até", de: "Gültig bis" },
  author: { fr: "Établi par", en: "Prepared by", es: "Elaborado por", pt: "Elaborado por", de: "Erstellt von" },
  phone: { fr: "Tél.", en: "Tel.", es: "Tel.", pt: "Tel.", de: "Tel." },
  vatId: { fr: "TVA intracommunautaire", en: "EU VAT number", es: "NIF-IVA intracomunitario", pt: "NIF intracomunitário", de: "USt-IdNr." },
  customer: { fr: "CLIENT", en: "CUSTOMER", es: "CLIENTE", pt: "CLIENTE", de: "KUNDE" },
  subject: { fr: "Objet :", en: "Subject:", es: "Objeto:", pt: "Objeto:", de: "Betreff:" },
  site: { fr: "Lieu d'exécution", en: "Work site", es: "Lugar de ejecución", pt: "Local da obra", de: "Ausführungsort" },
  start: { fr: "Démarrage estimé", en: "Estimated start", es: "Inicio estimado", pt: "Início previsto", de: "Voraussichtlicher Beginn" },
  duration: {
    fr: "Durée estimée des travaux",
    en: "Estimated duration",
    es: "Duración estimada",
    pt: "Duração prevista",
    de: "Voraussichtliche Dauer",
  },
  colLabel: { fr: "Désignation", en: "Description", es: "Descripción", pt: "Descrição", de: "Bezeichnung" },
  colQty: { fr: "Qté", en: "Qty", es: "Cant.", pt: "Qtd.", de: "Menge" },
  colUnit: { fr: "Unité", en: "Unit", es: "Unidad", pt: "Unid.", de: "Einheit" },
  colPrice: { fr: "PU HT", en: "Unit price", es: "P. unit.", pt: "P. unit.", de: "EP netto" },
  colDisc: { fr: "Rem.", en: "Disc.", es: "Dto.", pt: "Desc.", de: "Rab." },
  colVat: { fr: "TVA", en: "VAT", es: "IVA", pt: "IVA", de: "MwSt." },
  colTotal: { fr: "Total HT", en: "Net total", es: "Total neto", pt: "Total s/ IVA", de: "Netto" },
  section: { fr: "Section", en: "Section", es: "Sección", pt: "Secção", de: "Abschnitt" },
  subtotal: { fr: "Sous-total", en: "Subtotal", es: "Subtotal", pt: "Subtotal", de: "Zwischensumme" },
  excl: { fr: "HT", en: "excl. VAT", es: "sin IVA", pt: "s/ IVA", de: "netto" },
  incl: { fr: "TTC", en: "incl. VAT", es: "con IVA", pt: "c/ IVA", de: "brutto" },
  option: { fr: "Option : ", en: "Option: ", es: "Opción: ", pt: "Opção: ", de: "Option: " },
  variantIncluded: {
    fr: "variante comprise dans le total",
    en: "option included in the total",
    es: "variante incluida en el total",
    pt: "variante incluída no total",
    de: "Variante in der Summe enthalten",
  },
  variantAlternative: {
    fr: "variante au choix, non comprise dans le total",
    en: "alternative, not included in the total",
    es: "variante a elegir, no incluida en el total",
    pt: "variante à escolha, não incluída no total",
    de: "Alternative zur Wahl, nicht in der Summe enthalten",
  },
  variantPrice: { fr: "Prix de la variante", en: "Price of this alternative", es: "Precio de la variante", pt: "Preço da variante", de: "Preis der Variante" },
  variantsOffered: {
    fr: "Variantes au choix du client",
    en: "Alternatives for the client to choose",
    es: "Variantes a elección del cliente",
    pt: "Variantes à escolha do cliente",
    de: "Varianten nach Wahl des Kunden",
  },
  estimated: {
    fr: "Quantité estimée, à confirmer sur place",
    en: "Estimated quantity, to be confirmed on site",
    es: "Cantidad estimada, a confirmar en obra",
    pt: "Quantidade estimada, a confirmar no local",
    de: "Geschätzte Menge, vor Ort zu bestätigen",
  },
  optionalNote: {
    fr: "Proposée en option : non comprise dans le total, à cocher à l'acceptation",
    en: "Optional item: not included in the total, to be selected on acceptance",
    es: "Opcional: no incluida en el total, a marcar al aceptar",
    pt: "Opcional: não incluída no total, a assinalar na aceitação",
    de: "Optional: nicht in der Summe enthalten, bei der Annahme auszuwählen",
  },
  toComplete: { fr: "À compléter", en: "To be completed", es: "Por completar", pt: "A completar", de: "Offen" },
  totalBeforeDiscount: {
    fr: "Total HT avant remise",
    en: "Net total before discount",
    es: "Total neto antes del descuento",
    pt: "Total antes do desconto",
    de: "Netto vor Rabatt",
  },
  globalDiscount: { fr: "Remise globale", en: "Overall discount", es: "Descuento global", pt: "Desconto global", de: "Gesamtrabatt" },
  totalHt: { fr: "Total HT", en: "Total excl. VAT", es: "Total sin IVA", pt: "Total s/ IVA", de: "Summe netto" },
  vatNa: { fr: "Non applicable", en: "Not applicable", es: "No aplicable", pt: "Não aplicável", de: "Entfällt" },
  reverse: {
    fr: "Autoliquidation",
    en: "Reverse charge",
    es: "Inversión del sujeto pasivo",
    pt: "Autoliquidação",
    de: "Steuerschuldnerschaft des Leistungsempfängers",
  },
  on: { fr: "sur", en: "on", es: "sobre", pt: "sobre", de: "auf" },
  totalTtc: { fr: "Total TTC", en: "Total incl. VAT", es: "Total con IVA", pt: "Total c/ IVA", de: "Gesamtbetrag brutto" },
  optionsOffered: {
    fr: "option(s) proposée(s), non comprise(s)",
    en: "optional item(s), not included",
    es: "opción(es), no incluida(s)",
    pt: "opção(ões), não incluída(s)",
    de: "Option(en), nicht enthalten",
  },
  payment: { fr: "Conditions de paiement", en: "Payment terms", es: "Condiciones de pago", pt: "Condições de pagamento", de: "Zahlungsbedingungen" },
  special: {
    fr: "Conditions particulières",
    en: "Special conditions",
    es: "Condiciones particulares",
    pt: "Condições particulares",
    de: "Besondere Bedingungen",
  },
  mentions: {
    fr: "Mentions",
    en: "Legal notices (French)",
    es: "Menciones legales (en francés)",
    pt: "Menções legais (em francês)",
    de: "Rechtliche Hinweise (Französisch)",
  },
  reducedVat: {
    fr: "Attestation du client pour le taux réduit de TVA",
    en: "Customer certificate for the reduced VAT rate (French)",
    es: "Certificado del cliente para el tipo reducido de IVA (en francés)",
    pt: "Declaração do cliente para a taxa reduzida de IVA (em francês)",
    de: "Kundenbescheinigung für den ermäßigten MwSt.-Satz (Französisch)",
  },
  withdrawal: {
    fr: "Droit de rétractation",
    en: "Right of withdrawal (French)",
    es: "Derecho de desistimiento (en francés)",
    pt: "Direito de livre resolução (em francês)",
    de: "Widerrufsrecht (Französisch)",
  },
  withdrawalSummary: {
    fr: "",
    en: "You have 14 days from the conclusion of the contract to withdraw without giving any reason, using the form on the last page or any unambiguous statement.",
    es: "Dispone de 14 días desde la celebración del contrato para desistir sin indicar el motivo, con el formulario de la última página o cualquier declaración inequívoca.",
    pt: "Dispõe de 14 dias a contar da celebração do contrato para desistir sem indicar o motivo, com o formulário da última página ou qualquer declaração inequívoca.",
    de: "Sie können binnen 14 Tagen ab Vertragsschluss ohne Angabe von Gründen widerrufen, mit dem Formular auf der letzten Seite oder einer eindeutigen Erklärung.",
  },
  terms: {
    fr: "Conditions générales",
    en: "General terms (French)",
    es: "Condiciones generales (en francés)",
    pt: "Condições gerais (em francês)",
    de: "Allgemeine Bedingungen (Französisch)",
  },
  withdrawalForm: {
    fr: "Formulaire de rétractation",
    en: "Withdrawal form (French)",
    es: "Formulario de desistimiento (en francés)",
    pt: "Formulário de livre resolução (em francês)",
    de: "Widerrufsformular (Französisch)",
  },
  acceptance: {
    fr: "Bon pour accord du client",
    en: "Customer approval",
    es: "Conformidad del cliente",
    pt: "Aprovação do cliente",
    de: "Auftragsbestätigung des Kunden",
  },
  acceptanceHint: {
    fr: "Date, nom et signature précédés de la mention « Bon pour accord » :",
    en: "Date, name and signature preceded by the words « Bon pour accord » (approved):",
    es: "Fecha, nombre y firma precedidos de la mención « Bon pour accord » (conforme):",
    pt: "Data, nome e assinatura precedidos da menção « Bon pour accord » (aprovado):",
    de: "Datum, Name und Unterschrift mit dem Vermerk « Bon pour accord » (einverstanden):",
  },
  forOrg: { fr: "Pour", en: "For", es: "Por", pt: "Por", de: "Für" },
  page: { fr: "page", en: "page", es: "página", pt: "página", de: "Seite" },
  continued: { fr: "(suite)", en: "(continued)", es: "(continuación)", pt: "(continuação)", de: "(Fortsetzung)" },
  recapLots: { fr: "Récapitulatif par lot", en: "Summary by section", es: "Resumen por lote", pt: "Resumo por lote", de: "Übersicht nach Losen" },
  photos: { fr: "Photos et croquis", en: "Photos and sketches", es: "Fotos y croquis", pt: "Fotos e esboços", de: "Fotos und Skizzen" },
  recapAll: { fr: "Récapitulatif des lots", en: "Summary of sections", es: "Resumen de los lotes", pt: "Resumo dos lotes", de: "Übersicht der Lose" },
  detail: {
    fr: "Détail des prestations",
    en: "Detailed items",
    es: "Detalle de las prestaciones",
    pt: "Detalhe dos trabalhos",
    de: "Leistungsverzeichnis",
  },
  lotsTotal: {
    fr: "Total des lots HT",
    en: "Sections total excl. VAT",
    es: "Total de los lotes sin IVA",
    pt: "Total dos lotes s/ IVA",
    de: "Summe der Lose netto",
  },
  beforeGlobal: {
    fr: ", avant remise globale",
    en: ", before overall discount",
    es: ", antes del descuento global",
    pt: ", antes do desconto global",
    de: ", vor Gesamtrabatt",
  },
  lot: { fr: "Lot", en: "Section", es: "Lote", pt: "Lote", de: "Los" },
  courtesy: {
    fr: "",
    en: "Courtesy translation of quote {n}. Item descriptions are in French. Only the French version issued by the company is binding.",
    es: "Traducción de cortesía del presupuesto {n}. Las descripciones están en francés. Solo la versión francesa emitida por la empresa es vinculante.",
    pt: "Tradução de cortesia do orçamento {n}. As descrições estão em francês. Só a versão francesa emitida pela empresa faz fé.",
    de: "Unverbindliche Übersetzung des Angebots {n}. Die Leistungsbeschreibungen sind auf Französisch. Maßgeblich ist allein die französische Fassung.",
  },
  preview: {
    fr: "APERÇU - DOCUMENT NON ÉMIS",
    en: "PREVIEW - NOT ISSUED",
    es: "VISTA PREVIA - NO EMITIDO",
    pt: "PRÉ-VISUALIZAÇÃO - NÃO EMITIDO",
    de: "VORSCHAU - NICHT AUSGESTELLT",
  },
} satisfies Record<string, Record<Lang, string>>;

export type Key = keyof typeof T;

export function translator(lang: Lang = "fr") {
  return (k: Key) => T[k][lang];
}

const UNITS: Record<string, Record<Exclude<Lang, "fr">, string>> = {
  u: { en: "pc", es: "ud", pt: "un", de: "Stk" },
  j: { en: "day", es: "día", pt: "dia", de: "Tag" },
  forfait: { en: "lump sum", es: "global", pt: "global", de: "pauschal" },
  ens: { en: "set", es: "conj.", pt: "conj.", de: "Satz" },
  lot: { en: "lot", es: "lote", pt: "lote", de: "Los" },
  sac: { en: "bag", es: "saco", pt: "saco", de: "Sack" },
};

export function unitLabel(unit: string, lang: Lang = "fr") {
  if (lang === "fr") return unit;
  return UNITS[unit.trim().toLowerCase()]?.[lang] ?? unit;
}
