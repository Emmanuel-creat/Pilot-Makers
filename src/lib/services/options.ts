/**
 * Lignes en option : chiffrées sur le devis, hors total, et retenues ou non par le client
 * au moment de l'acceptation. Le devis accepté ne contient plus que les options choisies.
 */

import { computeQuote, type CalcResult } from "@/lib/calc/engine";
import { draftToCalcInput } from "@/lib/calc/draft";
import type { DraftSection, QuoteSnapshot } from "./quote-types";

type OptionSnapshot = Pick<QuoteSnapshot, "sections" | "calc"> & {
  org: Pick<QuoteSnapshot["org"], "vat_regime">;
  quote: Pick<QuoteSnapshot["quote"], "globalDiscount" | "reverseCharge">;
};

export interface OptionLine {
  id: string;
  label: string;
  netCents: number;
  vatBp: number;
  ttcCents: number;
}

/** Options proposées dans une version émise, avec leur prix. */
export function snapshotOptions(s: OptionSnapshot): OptionLine[] {
  const results = new Map(s.calc.sections.flatMap((sec) => sec.lines).map((r) => [r.id, r]));
  const exempt = s.org.vat_regime === "franchise" || s.quote.reverseCharge === true;
  return s.sections.flatMap((sec) =>
    sec.lines
      .filter((l) => l.optional && l.kind === "item")
      .map((l) => {
        const r = results.get(l.id);
        const net = r?.netCents ?? 0;
        const vatBp = exempt ? 0 : (r?.vatBp ?? 0);
        return { id: l.id, label: l.label, netCents: net, vatBp, ttcCents: net + Math.round((net * vatBp) / 10000) };
      }),
  );
}

/** Sections du devis accepté : options choisies intégrées, options écartées retirées. */
export function withChosenOptions(sections: DraftSection[], chosen: readonly string[]): DraftSection[] {
  const keep = new Set(chosen);
  return sections.map((sec) => ({
    ...sec,
    lines: sec.lines
      .filter((l) => !l.optional || keep.has(l.id))
      .map((l) => {
        if (!l.optional) return l;
        const { optional: _optional, ...rest } = l;
        return rest;
      }),
  }));
}

/** Totaux du devis tel qu'accepté (options choisies comprises). Sans option, ce sont ceux de la version. */
export function acceptedCalc(s: OptionSnapshot, chosen: readonly string[]): CalcResult {
  if (!s.calc.options) return s.calc;
  const exempt = s.org.vat_regime === "franchise" || s.quote.reverseCharge === true;
  return computeQuote(draftToCalcInput({ sections: withChosenOptions(s.sections, chosen), globalDiscount: s.quote.globalDiscount }, exempt));
}

/** Contrôle les options choisies : elles doivent toutes être proposées dans la version. */
export function validChoice(s: OptionSnapshot, chosen: readonly string[]): string[] | null {
  const offered = new Set(snapshotOptions(s).map((o) => o.id));
  const unique = [...new Set(chosen)];
  return unique.every((id) => offered.has(id)) ? unique : null;
}

/** Données suffisantes pour recalculer le total côté navigateur, sans les coûts internes. */
export type OptionCalcSource = Pick<QuoteSnapshot, "sections" | "calc"> & {
  org: Pick<QuoteSnapshot["org"], "vat_regime">;
  quote: Pick<QuoteSnapshot["quote"], "globalDiscount" | "reverseCharge">;
};

export function publicOptionSource(s: QuoteSnapshot): OptionCalcSource | null {
  if (!s.calc.options) return null;
  return {
    sections: s.sections.map((sec) => ({ ...sec, lines: sec.lines.map((l) => ({ ...l, unitCost: "", internalNote: undefined })) })),
    calc: { ...s.calc, margin: { costCents: 0, linesWithoutCost: 0, marginCents: 0, marginRateBp: null, markupRateBp: null } },
    org: { vat_regime: s.org.vat_regime },
    quote: { globalDiscount: s.quote.globalDiscount, reverseCharge: s.quote.reverseCharge },
  };
}
