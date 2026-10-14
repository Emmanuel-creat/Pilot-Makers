/**
 * Tests ajoutés après la campagne de tests de mutation (scripts/mutation.mjs) : chacun tue un mutant qui survivait
 * aux tests de calcul existants. Les valeurs sont des montants exacts, pas des ordres de grandeur.
 */
import { describe, expect, it } from "vitest";
import { computeQuote, type CalcLineInput } from "@/lib/calc/engine";
import { priceRoundings, roundStep, roundTarget, totalRounding } from "@/lib/calc/rounding";
import { groupRuns, runAt } from "@/lib/calc/groups";
import { formatEuros } from "@/lib/calc/format";
import type { DraftSection } from "@/lib/services/quote-types";
import { line } from "./helpers";

const item = (p: Partial<CalcLineInput> = {}): CalcLineInput => ({
  id: p.id ?? "l1",
  kind: "item",
  label: "Pose",
  quantity: "2",
  unitPrice: "100",
  vatPercent: "20",
  ...p,
});
const quote = (lines: CalcLineInput[], extra: { globalDiscountPercent?: string; vatExempt?: boolean } = {}) =>
  computeQuote({ sections: [{ id: "s1", lines }], ...extra });
const codes = (r: ReturnType<typeof computeQuote>) => r.issues.map((i) => `${i.field ?? ""}:${i.code}`);

describe("mutation : totaux exacts", () => {
  it("brut, remise de ligne, sous-total et coûts sont exacts au centime", () => {
    const r = quote([
      item({ id: "a", quantity: "2", unitPrice: "100", discountPercent: "10", unitCost: "60" }),
      item({ id: "b", quantity: "1", unitPrice: "50", vatPercent: "10", unitCost: "20,5" }),
    ]);
    expect(r.grossCents).toBe(25000);
    expect(r.lineDiscountCents).toBe(2000);
    expect(r.subtotalCents).toBe(23000);
    expect(r.totalHtCents).toBe(23000);
    expect(r.margin.costCents).toBe(14050);
    expect(r.margin.marginCents).toBe(8950);
    expect(r.margin.marginRateBp).toBe(3891); // 89,50 / 230
    expect(r.margin.markupRateBp).toBe(6370); // 89,50 / 140,50
    expect(r.sections[0].lines[0].unitCost4).toBe(600000);
    expect(r.sections[0].lines[0].costCents).toBe(12000);
    expect(r.sections[0].lines[1].costCents).toBe(2050);
  });

  it("les groupes de TVA sont triés par taux décroissant", () => {
    const r = quote([item({ id: "a", vatPercent: "5,5" }), item({ id: "b", vatPercent: "20" }), item({ id: "c", vatPercent: "10" })]);
    expect(r.vatGroups.map((g) => g.vatBp)).toEqual([2000, 1000, 550]);
  });

  it("option : HT et TTC exacts, coût de l'option sans effet sur la marge", () => {
    const r = quote([item({ id: "a" }), item({ id: "o", optional: true, quantity: "1", unitPrice: "33,33", vatPercent: "10", unitCost: "10" })]);
    expect(r.options).toEqual({ count: 1, htCents: 3333, ttcCents: 3666 });
    expect(r.sections[0].lines[1].costCents).toBe(1000);
    expect(r.margin.costCents).toBe(0);
    expect(r.totalHtCents).toBe(20000);
  });

  it("remise globale : bornes 0 et 100 % acceptées, au-delà refusée", () => {
    expect(quote([item()], { globalDiscountPercent: "100" }).totalHtCents).toBe(0);
    expect(quote([item()], { globalDiscountPercent: "0" }).totalHtCents).toBe(20000);
    expect(codes(quote([item()], { globalDiscountPercent: "100,01" }))).toContain("globalDiscountPercent:too_large");
    expect(codes(quote([item()], { globalDiscountPercent: "-1" }))).toContain("globalDiscountPercent:too_small");
  });
});

describe("mutation : bornes des champs", () => {
  it("quantité, prix et remise acceptés exactement à leur borne", () => {
    expect(quote([item({ quantity: "1000000" })]).ok).toBe(true);
    expect(quote([item({ quantity: "0" })]).ok).toBe(true);
    expect(quote([item({ unitPrice: "1000000" })]).ok).toBe(true);
    expect(quote([item({ unitPrice: "0" })]).ok).toBe(true);
    expect(quote([item({ discountPercent: "100" })]).ok).toBe(true);
    expect(quote([item({ discountPercent: "0" })]).ok).toBe(true);
    expect(quote([item({ unitCost: "0" })]).margin.costCents).toBe(0);
    expect(quote([item({ unitCost: "1000000", quantity: "1" })]).margin.costCents).toBe(100000000);
  });

  it("et refusés juste au-delà", () => {
    expect(codes(quote([item({ quantity: "1000000,001" })]))).toContain("quantity:too_large");
    expect(codes(quote([item({ quantity: "-0,001" })]))).toContain("quantity:too_small");
    expect(codes(quote([item({ unitPrice: "1000000,0001" })]))).toContain("unitPrice:too_large");
    expect(codes(quote([item({ unitPrice: "-0,0001" })]))).toContain("unitPrice:too_small");
    expect(codes(quote([item({ discountPercent: "100,01" })]))).toContain("discountPercent:too_large");
    expect(codes(quote([item({ unitCost: "1000000,0001" })]))).toContain("unitCost:too_large");
    expect(codes(quote([item({ unitCost: "-1" })]))).toContain("unitCost:too_small");
    expect(codes(quote([item({ vatPercent: "100,01" })]))).toContain("vatPercent:too_large");
  });

  it("un prix signé accepte le négatif jusqu'à la borne", () => {
    expect(quote([item({ unitPrice: "-1000000", signed: true })]).ok).toBe(true);
    expect(codes(quote([item({ unitPrice: "-1000000,0001", signed: true })]))).toContain("unitPrice:too_small");
  });

  it("libellé vide ou fait d'espaces : bloquant ; TVA inhabituelle : avertissement seulement", () => {
    expect(codes(quote([item({ label: "" })]))).toContain("label:missing");
    expect(codes(quote([item({ label: "   " })]))).toContain("label:missing");
    expect(codes(quote([item({ label: "Pose" })]))).not.toContain("label:missing");
    const r = quote([item({ vatPercent: "7" })]);
    expect(codes(r)).toContain("vatPercent:unusual_vat");
    expect(r.ok).toBe(true);
    expect(codes(quote([item({ vatPercent: "20" })]))).not.toContain("vatPercent:unusual_vat");
    expect(codes(quote([item({ vatPercent: "" })], { vatExempt: true }))).not.toContain("vatPercent:unusual_vat");
  });
});

describe("mutation : arrondis", () => {
  const section = (lines: ReturnType<typeof line>[]) => ({ id: "s1", title: "Sol", description: "", lines }) as unknown as DraftSection;

  it("une ligne signée n'est jamais proposée à l'arrondi, même positive", () => {
    expect(priceRoundings([section([line({ unitPrice: "12,34", signed: true })])])).toEqual([]);
    expect(priceRoundings([section([line({ unitPrice: "12,34" })])])).toHaveLength(1);
  });

  it("pas du total rond aux changements de palier", () => {
    expect(roundStep(99999)).toBe(1000);
    expect(roundStep(100000)).toBe(5000);
    expect(roundStep(999999)).toBe(5000);
    expect(roundStep(1000000)).toBe(10000);
    expect(roundTarget(100000)).toBe(100000);
    expect(roundTarget(1004999)).toBe(1000000);
  });

  it("pas de total rond si le devis a un problème bloquant ou un total nul", () => {
    const blocked = section([line({ unitPrice: "43,87" }), line({ label: "" })]);
    expect(totalRounding({ sections: [blocked], globalDiscount: "" }, false)).toBeNull();
    expect(totalRounding({ sections: [section([line({ unitPrice: "0" })])], globalDiscount: "" }, false)).toBeNull();
  });

  it("seuil d'un euro sous le montant rond supérieur", () => {
    const at = (price: string) =>
      totalRounding({ sections: [section([line({ quantity: "1", unitPrice: price, vatPercent: "20" })])], globalDiscount: "" }, false);
    // 832,50 HT : 999,00 TTC, à 1 € pile de 1 000 € : l'arrondi à 990 € est proposé.
    expect(at("832,5")).toMatchObject({ targetCents: 99000 });
    // 832,5083 HT : 999,01 TTC, à 99 centimes de 1 000 € : arrondi déjà fait, rien à proposer.
    expect(at("832,5083")).toBeNull();
  });
});

describe("mutation : regroupements", () => {
  const runs = groupRuns(
    [
      { id: "a", group: "Bât. A", lines: [{ kind: "item" }] },
      { id: "b", group: "Bât. A", lines: [{ kind: "note" }] },
      { id: "c", group: "", lines: [{ kind: "item" }] },
    ],
    () => 100,
  );
  it("runAt couvre les deux bornes de l'ensemble et pas au-delà", () => {
    expect(runAt(runs, 0)?.group).toBe("Bât. A");
    expect(runAt(runs, 1)?.group).toBe("Bât. A");
    expect(runAt(runs, 2)).toBeUndefined();
    expect(runAt(runs, -1)).toBeUndefined();
    expect(runs[0].cents).toBe(200);
    expect(runs[0].items).toBe(true);
    const notes = groupRuns([{ id: "n", group: "Zone B", lines: [{ kind: "note" }] }], () => 0);
    expect(notes[0].items).toBe(false);
  });
});

describe("mutation : bornes basses et cas limites", () => {
  it("zéro accepté pour le coût, la TVA et la remise globale", () => {
    expect(quote([item({ unitCost: "0" })]).ok).toBe(true);
    expect(quote([item({ vatPercent: "0" })]).ok).toBe(true);
    expect(quote([item()], { globalDiscountPercent: "0" }).ok).toBe(true);
  });

  it("option : TVA de l'option et coût unitaire conservé", () => {
    const r = quote([item({ id: "a" }), item({ id: "o", optional: true, quantity: "1", unitPrice: "1000", vatPercent: "20", unitCost: "10" })]);
    expect(r.options?.ttcCents).toBe(120000);
    expect(r.sections[0].lines[1].unitCost4).toBe(100000);
  });

  it("taux de marge et de majoration calculés dès un centime", () => {
    const r = quote([item({ quantity: "1", unitPrice: "0,01", unitCost: "0,01", vatPercent: "20" })]);
    expect(r.totalHtCents).toBe(1);
    expect(r.margin.marginRateBp).toBe(0);
    expect(r.margin.markupRateBp).toBe(0);
  });

  it("zéro euro s'écrit sans signe moins", () => {
    expect(formatEuros(0)).not.toContain("-");
    expect(formatEuros(-1)).toContain("-");
  });
});

describe("mutation : remise d'arrondi exacte", () => {
  const exempt = (price: string) =>
    totalRounding(
      {
        sections: [{ id: "s1", title: "", description: "", lines: [line({ quantity: "1", unitPrice: price, vatPercent: "" })] } as unknown as DraftSection],
        globalDiscount: "",
      },
      true,
    );
  it("plus petite remise qui tombe pile sur le montant rond", () => {
    // 103,00 sans TVA : 2,91 % donne 100,00 pile (2,92 % donnerait 99,99).
    expect(exempt("103")).toEqual({ targetCents: 10000, discountBp: 291, resultCents: 10000 });
  });
  it("la remise maximale de 3 % est acceptée quand elle tombe pile", () => {
    // 103,09 : 3 % retire 3,09 et donne 100,00 pile.
    expect(exempt("103,09")).toEqual({ targetCents: 10000, discountBp: 300, resultCents: 10000 });
  });
});
