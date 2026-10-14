/**
 * Mode présentation chez le client : le devis émis découpé en écrans lisibles sur tablette,
 * sans aucune donnée interne (coûts, marges, commentaires, métrés).
 */

import { formatQuantity } from "@/lib/calc/format";
import type { QuoteSnapshot } from "@/lib/services/quote-types";

export interface PresentationLine {
  id: string;
  label: string;
  description: string;
  quantity: string;
  netCents: number;
  optional: boolean;
  note: boolean;
}

export interface PresentationSection {
  id: string;
  title: string;
  description: string;
  group: string;
  /** Alternative d'un choix : « Finitions : Confort » */
  variant: string;
  subtotalCents: number;
  lines: PresentationLine[];
}

export interface PresentationDeck {
  orgName: string;
  logo: string | null;
  accentColor: string;
  number: string;
  title: string;
  description: string;
  customerName: string;
  site: string;
  issueDate: string;
  validUntil: string;
  estimatedDuration: string;
  estimatedStart: string;
  depositPercent: string;
  sections: PresentationSection[];
  media: { caption: string; dataUrl: string }[];
  totals: { htCents: number; vatCents: number; ttcCents: number; exempt: boolean };
}

export function buildDeck(s: QuoteSnapshot): PresentationDeck {
  const results = new Map(s.calc.sections.map((sec) => [sec.id, sec]));
  const site = [s.quote.site.line1, s.quote.site.line2, [s.quote.site.postalCode, s.quote.site.city].filter(Boolean).join(" ")]
    .filter((x) => x?.trim())
    .join(", ");
  return {
    orgName: s.org.trade_name || s.org.legal_name,
    logo: s.org.logo_data,
    accentColor: s.accentColor,
    number: s.number,
    title: s.quote.title,
    description: s.quote.description,
    customerName: s.customer.contact || s.customer.name,
    site,
    issueDate: s.issueDate,
    validUntil: s.validUntil,
    estimatedDuration: s.quote.estimatedDuration,
    estimatedStart: s.quote.estimatedStart,
    depositPercent: s.quote.depositPercent,
    sections: s.sections.map((sec) => {
      const r = results.get(sec.id);
      const lineResults = new Map((r?.lines ?? []).map((l) => [l.id, l]));
      return {
        id: sec.id,
        title: sec.title,
        description: sec.description,
        group: sec.group ?? "",
        variant: sec.choice?.name ? `${sec.choice.name} : ${sec.choice.label}` : "",
        subtotalCents: r?.subtotalCents ?? 0,
        lines: sec.lines.map((l) => {
          const lr = lineResults.get(l.id);
          return {
            id: l.id,
            label: l.label,
            description: l.description,
            quantity: l.kind === "item" && lr ? `${formatQuantity(lr.quantityMilli)} ${l.unit}`.trim() : "",
            netCents: lr?.netCents ?? 0,
            optional: Boolean(l.optional),
            note: l.kind === "note",
          };
        }),
      };
    }),
    media: (s.media ?? []).map((m) => ({ caption: m.caption, dataUrl: m.dataUrl })),
    totals: {
      htCents: s.calc.totalHtCents,
      vatCents: s.calc.totalVatCents,
      ttcCents: s.calc.totalTtcCents,
      exempt: s.org.vat_regime === "franchise" || s.quote.reverseCharge === true,
    },
  };
}

/** Nombre d'écrans : couverture, un par lot, photos s'il y en a, puis récapitulatif et signature. */
export function slideCount(d: PresentationDeck): number {
  return 1 + d.sections.length + (d.media.length ? 1 : 0) + 1;
}
