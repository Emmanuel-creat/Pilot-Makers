import { describe, expect, it } from "vitest";
import { applyPriceRoundings, commercialPrice4, priceRoundings, priceStep4, roundStep, roundTarget, totalRounding } from "@/lib/calc/rounding";
import { draftToCalcInput } from "@/lib/calc/draft";
import { computeQuote } from "@/lib/calc/engine";
import type { DraftSection } from "@/lib/services/quote-types";
import { line } from "./helpers";

const section = (lines: ReturnType<typeof line>[]) => ({ id: "s1", title: "Sol", description: "", lines }) as unknown as DraftSection;

describe("arrondis commerciaux : prix unitaires", () => {
  it("pas grandissant avec le prix, moitié vers le haut", () => {
    expect(priceStep4(99999n)).toBe(1000n);
    expect(priceStep4(100000n)).toBe(5000n);
    expect(priceStep4(1000000n)).toBe(10000n);
    expect(priceStep4(10000000n)).toBe(50000n);
    expect(commercialPrice4(87300n)).toBe(87000n); // 8,73 € -> 8,70 €
    expect(commercialPrice4(87500n)).toBe(88000n); // 8,75 € -> 8,80 €
    expect(commercialPrice4(438700n)).toBe(440000n); // 43,87 € -> 44,00 €
    expect(commercialPrice4(4362000n)).toBe(4360000n); // 436,20 € -> 436 €
    expect(commercialPrice4(12370000n)).toBe(12350000n); // 1 237 € -> 1 235 €
    expect(commercialPrice4(400n)).toBe(400n); // 0,04 € : trop petit pour être arrondi
    expect(commercialPrice4(0n)).toBe(0n);
  });

  it("propose les lignes à arrondir et les applique", () => {
    const a = line({ unitPrice: "43,87", label: "Ragréage" });
    const s = section([
      a,
      line({ unitPrice: "45" }),
      line({ unitPrice: "" }),
      line({ unitPrice: "abc" }),
      line({ kind: "note", unitPrice: "1,23" }),
      line({ unitPrice: "-12,34", signed: true }),
    ]);
    const r = priceRoundings([s]);
    expect(r).toEqual([{ sectionId: "s1", lineId: a.id, label: "Ragréage", fromPrice4: 438700, toPrice4: 440000 }]);
    const out = applyPriceRoundings([s], r);
    expect(out[0].lines[0].unitPrice).toBe("44,00");
    expect(out[0].lines[1]).toBe(s.lines[1]);
  });
});

describe("arrondis commerciaux : total TTC", () => {
  it("cible la dizaine, la cinquantaine ou la centaine inférieure", () => {
    expect(roundTarget(98765)).toBe(98000);
    expect(roundTarget(487320)).toBe(485000);
    expect(roundTarget(1234567)).toBe(1230000);
  });

  it("calcule la remise globale qui donne un total rond", () => {
    // 20 m² x 43,87 € HT, TVA 10 % : 965,14 € TTC -> 960 €
    const d = { sections: [section([line({ unitPrice: "43,87" })])], globalDiscount: "" };
    const r = totalRounding(d, false)!;
    expect(r.targetCents).toBe(96000);
    expect(r.resultCents).toBeLessThanOrEqual(96000);
    expect(r.resultCents).toBeGreaterThan(95900);
    const applied = computeQuote(draftToCalcInput({ ...d, globalDiscount: String(r.discountBp / 100) }, false));
    expect(applied.totalTtcCents).toBe(r.resultCents);
    // La remise juste en dessous ne suffit pas.
    expect(computeQuote(draftToCalcInput({ ...d, globalDiscount: String((r.discountBp - 1) / 100) }, false)).totalTtcCents).toBeGreaterThan(96000);
  });

  it("ne propose rien quand le total est déjà rond, trop loin du rond ou incomplet", () => {
    expect(totalRounding({ sections: [section([line({ unitPrice: "50" })])], globalDiscount: "" }, true)).toBeNull(); // 1 000 € pile
    expect(totalRounding({ sections: [section([line({ unitPrice: "52,40" })])], globalDiscount: "" }, true)).toBeNull(); // 1 048 € : 4,6 %
    expect(totalRounding({ sections: [section([line({ unitPrice: "0,4", quantity: "1" })])], globalDiscount: "" }, true)).toBeNull(); // cible 0
    expect(totalRounding({ sections: [section([line({ unitPrice: "0" })])], globalDiscount: "" }, true)).toBeNull();
    expect(totalRounding({ sections: [section([line({ unitPrice: "49,996" })])], globalDiscount: "" }, true)).toBeNull(); // 999,92 € : déjà rond
    expect(roundStep(99999)).toBe(1000);
    expect(totalRounding({ sections: [section([line({ unitPrice: "" })])], globalDiscount: "" }, true)).toBeNull();
  });
});
