import { describe, expect, it } from "vitest";
import { computeQuote, type CalcLineInput } from "@/lib/calc/engine";
import { divRound, parseScaled } from "@/lib/calc/decimal";
import { formatEuros, formatPercent, formatQuantity, formatUnitPrice } from "@/lib/calc/format";

let n = 0;
const line = (p: Partial<CalcLineInput>): CalcLineInput => ({
  id: `l${++n}`,
  kind: "item",
  label: "Prestation",
  quantity: "1",
  unitPrice: "0",
  vatPercent: "20",
  ...p,
});
const quote = (lines: CalcLineInput[], extra: Record<string, unknown> = {}) =>
  computeQuote({ sections: [{ id: "s1", lines }], ...extra });

// Résultats attendus calculés à la main, indépendamment du moteur.
describe("décimaux", () => {
  it("lit la virgule et le point", () => {
    expect(parseScaled("12,5", 3)).toBe(12500n);
    expect(parseScaled("12.5", 3)).toBe(12500n);
    expect(parseScaled(" 1 234,50 ", 2)).toBe(123450n);
    expect(parseScaled("0,10", 2)).toBe(10n);
    expect(parseScaled(",5", 2)).toBe(50n);
  });
  it("refuse les valeurs invalides", () => {
    expect(() => parseScaled("abc", 2)).toThrow();
    expect(() => parseScaled("1,234", 2)).toThrow();
    expect(() => parseScaled("", 2)).toThrow();
    expect(() => parseScaled("1e5", 2)).toThrow();
  });
  it("arrondit la moitié vers l'extérieur", () => {
    expect(divRound(5n, 10n)).toBe(1n);
    expect(divRound(4n, 10n)).toBe(0n);
    expect(divRound(15n, 10n)).toBe(2n);
    expect(divRound(-15n, 10n)).toBe(-2n);
  });
});

describe("moteur de calcul : cas de référence 7.2", () => {
  it("1. une seule ligne sans remise (maquette du cahier des charges)", () => {
    const r = quote([line({ quantity: "20", unitPrice: "45", vatPercent: "10" })]);
    expect(r.ok).toBe(true);
    expect(r.totalHtCents).toBe(90000);
    expect(r.totalVatCents).toBe(9000);
    expect(r.totalTtcCents).toBe(99000);
  });

  it("2. plusieurs lignes avec quantités décimales", () => {
    // 12,35 x 18,90 = 233,415 -> 233,42 ; 3,333 x 7,77 = 25,89741 -> 25,90
    const r = quote([
      line({ quantity: "12,35", unitPrice: "18,90" }),
      line({ quantity: "3,333", unitPrice: "7,77" }),
    ]);
    expect(r.sections[0].lines.map((l) => l.netCents)).toEqual([23342, 2590]);
    expect(r.totalHtCents).toBe(25932);
    // TVA 20 % de 259,32 = 51,864 -> 51,86
    expect(r.totalVatCents).toBe(5186);
    expect(r.totalTtcCents).toBe(31118);
  });

  it("3. plusieurs taux de TVA ventilés", () => {
    const r = quote([
      line({ quantity: "1", unitPrice: "1000", vatPercent: "20" }),
      line({ quantity: "1", unitPrice: "500", vatPercent: "10" }),
      line({ quantity: "1", unitPrice: "200", vatPercent: "5,5" }),
    ]);
    expect(r.vatGroups).toEqual([
      { vatBp: 2000, baseCents: 100000, vatCents: 20000 },
      { vatBp: 1000, baseCents: 50000, vatCents: 5000 },
      { vatBp: 550, baseCents: 20000, vatCents: 1100 },
    ]);
    expect(r.totalHtCents).toBe(170000);
    expect(r.totalVatCents).toBe(26100);
    expect(r.totalTtcCents).toBe(196100);
  });

  it("4. remise par ligne appliquée avant la TVA", () => {
    // 7 x 33,33 = 233,31 ; remise 12,5 % -> 204,14625 -> 204,15
    const r = quote([line({ quantity: "7", unitPrice: "33,33", discountPercent: "12,5" })]);
    const l = r.sections[0].lines[0];
    expect(l.grossCents).toBe(23331);
    expect(l.netCents).toBe(20415);
    expect(l.discountCents).toBe(2916);
    expect(l.discountBp).toBe(1250);
    // TVA 20 % de 204,15 = 40,83
    expect(r.totalVatCents).toBe(4083);
    expect(r.totalTtcCents).toBe(24498);
  });

  it("5. remise globale répartie par taux", () => {
    const r = quote(
      [line({ quantity: "1", unitPrice: "1000", vatPercent: "20" }), line({ quantity: "1", unitPrice: "333,33", vatPercent: "10" })],
      { globalDiscountPercent: "5" },
    );
    // 1000 -> remise 50,00 -> 950,00 ; TVA 190,00
    // 333,33 -> remise 16,6665 -> 16,67 -> 316,66 ; TVA 31,666 -> 31,67
    expect(r.globalDiscountCents).toBe(6667);
    expect(r.totalHtCents).toBe(126666);
    expect(r.totalVatCents).toBe(22167);
    expect(r.totalTtcCents).toBe(148833);
  });

  it("6. montants de très faible valeur", () => {
    // 3 x 0,0049 = 0,0147 -> 0,01
    const r = quote([line({ quantity: "3", unitPrice: "0,0049" })]);
    expect(r.totalHtCents).toBe(1);
    expect(r.totalVatCents).toBe(0);
    expect(r.totalTtcCents).toBe(1);
  });

  it("7. montants élevés sans perte de précision", () => {
    // (1e6 - 0,001) x (1e5 - 0,0001) = 99 999 999 800,0000001 euros
    const r = quote([line({ quantity: "999999,999", unitPrice: "99999,9999" })]);
    expect(r.totalHtCents).toBe(9999999980000);
    expect(Number.isSafeInteger(r.totalTtcCents)).toBe(true);
  });

  it("8. quantités nulles ou invalides", () => {
    const zero = quote([line({ quantity: "0", unitPrice: "10" })]);
    expect(zero.issues.some((i) => i.code === "zero_qty" && !i.blocking)).toBe(true);
    const neg = quote([line({ quantity: "-2", unitPrice: "10" })]);
    expect(neg.ok).toBe(false);
    expect(neg.issues[0].code).toBe("too_small");
    const bad = quote([line({ quantity: "deux", unitPrice: "10" })]);
    expect(bad.ok).toBe(false);
    const negPrice = quote([line({ quantity: "1", unitPrice: "-10" })]);
    expect(negPrice.ok).toBe(false);
    const tooMany = quote([line({ quantity: "1,2345", unitPrice: "10" })]);
    expect(tooMany.ok).toBe(false);
  });

  it("9. valeurs saisies avec virgule décimale", () => {
    const r = quote([line({ quantity: "2,5", unitPrice: "12,40", vatPercent: "5,5" })]);
    expect(r.totalHtCents).toBe(3100);
    // 31,00 x 5,5 % = 1,705 -> 1,71
    expect(r.totalVatCents).toBe(171);
  });

  it("10. lignes à compléter bloquantes, notes ignorées", () => {
    const r = quote([
      line({ quantity: "1", unitPrice: "100" }),
      { id: "p", kind: "pending", label: "Évacuation des gravats" },
      { id: "n", kind: "note", label: "Support à vérifier" },
    ]);
    expect(r.totalHtCents).toBe(10000);
    expect(r.ok).toBe(false);
    expect(r.issues.find((i) => i.lineId === "p")?.blocking).toBe(true);
  });

  it("11. devis vide refusé", () => {
    const r = computeQuote({ sections: [] });
    expect(r.ok).toBe(false);
    expect(r.issues[0].code).toBe("no_lines");
  });

  it("12. franchise en base de TVA : TVA nulle", () => {
    const r = quote([line({ quantity: "1", unitPrice: "100", vatPercent: "" })], { vatExempt: true });
    expect(r.ok).toBe(true);
    expect(r.totalVatCents).toBe(0);
    expect(r.totalTtcCents).toBe(10000);
  });

  it("13. sous-totaux de section", () => {
    const r = computeQuote({
      sections: [
        { id: "a", lines: [line({ quantity: "2", unitPrice: "10" }), line({ quantity: "1", unitPrice: "5" })] },
        { id: "b", lines: [line({ quantity: "1", unitPrice: "100" })] },
      ],
    });
    expect(r.sections.map((s) => s.subtotalCents)).toEqual([2500, 10000]);
    expect(r.totalHtCents).toBe(12500);
  });

  it("14. taux de TVA inhabituel signalé sans bloquer", () => {
    const r = quote([line({ quantity: "1", unitPrice: "100", vatPercent: "7" })]);
    expect(r.ok).toBe(true);
    expect(r.issues.some((i) => i.code === "unusual_vat")).toBe(true);
  });

  it("15. remise supérieure à 100 % refusée", () => {
    const r = quote([line({ quantity: "1", unitPrice: "100", discountPercent: "120" })]);
    expect(r.ok).toBe(false);
  });

  it("16. déterminisme : même entrée, même résultat", () => {
    const lines = [line({ quantity: "3,7", unitPrice: "19,99", discountPercent: "3" })];
    expect(JSON.stringify(quote(lines))).toBe(JSON.stringify(quote(lines)));
  });
});

describe("marge prévisionnelle", () => {
  it("distingue taux de marge et taux de majoration", () => {
    const r = quote([
      line({ quantity: "10", unitPrice: "50", unitCost: "30" }),
      line({ quantity: "5", unitPrice: "40", unitCost: "25" }),
    ]);
    // vente 700, coût 425, marge 275 ; marge/vente 39,29 % ; marge/coût 64,71 %
    expect(r.margin.costCents).toBe(42500);
    expect(r.margin.marginCents).toBe(27500);
    expect(r.margin.marginRateBp).toBe(3929);
    expect(r.margin.markupRateBp).toBe(6471);
  });
  it("compte les lignes sans coût interne", () => {
    const r = quote([line({ quantity: "1", unitPrice: "10" }), line({ quantity: "1", unitPrice: "10", unitCost: "4" })]);
    expect(r.margin.linesWithoutCost).toBe(1);
  });
  it("tient compte de la remise globale", () => {
    const r = quote([line({ quantity: "1", unitPrice: "100", unitCost: "50" })], { globalDiscountPercent: "10" });
    expect(r.margin.marginCents).toBe(4000);
  });
});

describe("mise en forme", () => {
  it("formate les montants en français", () => {
    expect(formatEuros(123456789)).toBe("1 234 567,89 €");
    expect(formatEuros(5)).toBe("0,05 €");
    expect(formatUnitPrice(459000)).toBe("45,90 €");
    expect(formatUnitPrice(490)).toBe("0,049 €");
    expect(formatQuantity(12500)).toBe("12,5");
    expect(formatPercent(550)).toBe("5,5 %");
  });
});
