import { describe, expect, it } from "vitest";
import { DecimalError, divRound, formatScaled, parseScaled } from "@/lib/calc/decimal";
import { draftToCalcInput } from "@/lib/calc/draft";
import { computeQuote } from "@/lib/calc/engine";
import { bpToInput, centsToInput, formatEuros, formatPercent, formatQuantity, formatUnitPrice, milliToInput, price4ToInput } from "@/lib/calc/format";
import { groupRuns, runAt } from "@/lib/calc/groups";
import { computeMeasure, emptyMeasure, parseMetres, sanitizeMeasure } from "@/lib/calc/measure";

/** Cas limites du moteur de calcul : chaque règle d'arrondi, de format et de contrôle est exercée. */
describe("moteur de calcul : cas limites", () => {
  it("convertit les nombres et arrondit demi vers l'extérieur", () => {
    expect(parseScaled(12.5, 3)).toBe(12500n);
    expect(parseScaled("-0,5", 2)).toBe(-50n);
    expect(parseScaled(".5", 1)).toBe(5n);
    expect(() => parseScaled(Number.POSITIVE_INFINITY, 2)).toThrow(DecimalError);
    expect(() => parseScaled("", 2)).toThrow(DecimalError);
    expect(() => parseScaled("1,234", 2)).toThrow(/décimales/);
    expect(() => parseScaled("abc", 2)).toThrow(/invalide/);
    expect(() => parseScaled(".", 2)).toThrow(/invalide/);
    expect(parseScaled("+3", 0)).toBe(3n);
    expect(() => parseScaled("+", 2)).toThrow(/invalide/);
    expect(parseScaled("4.", 1)).toBe(40n);
    expect(formatScaled(-1050n, 2)).toBe("-10.5");
    expect(formatScaled(7n, 0)).toBe("7");
    expect(formatScaled(100n, 2, 2)).toBe("1.00");
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(5n, -2n)).toBe(-3n);
    expect(divRound(-5n, -2n)).toBe(3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(() => divRound(1n, 0n)).toThrow(/zéro/);
  });

  it("met en forme montants, prix, quantités et taux", () => {
    expect(formatEuros(123456789n)).toBe("1 234 567,89 €");
    expect(formatEuros(-5, false)).toBe("-0,05");
    expect(formatUnitPrice(123456)).toBe("12,3456 €");
    expect(formatUnitPrice(100000, false)).toBe("10,00");
    expect(formatUnitPrice(0)).toBe("0,00 €");
    expect(formatQuantity(12500)).toBe("12,5");
    expect(formatPercent(550)).toBe("5,5 %");
    expect(formatPercent(2000, false)).toBe("20");
    expect(centsToInput(1050)).toBe("10,50");
    expect(price4ToInput(455000)).toBe("45,50");
    expect(milliToInput(2250)).toBe("2,25");
    expect(bpToInput(1000)).toBe("10");
  });

  it("signale chaque champ manquant ou invalide sans jamais calculer faux", () => {
    const r = computeQuote({
      sections: [
        {
          id: "s",
          lines: [
            { id: "a", kind: "item", label: "", quantity: "", unitPrice: "10", vatPercent: "20" },
            { id: "b", kind: "item", label: "Prix illisible", quantity: "1", unitPrice: "dix", vatPercent: "20" },
            { id: "c", kind: "item", label: "Taux inconnu", quantity: "1", unitPrice: "10", vatPercent: "7" },
            { id: "d", kind: "item", label: "Remise excessive", quantity: "1", unitPrice: "10", vatPercent: "20", discountPercent: "120" },
            { id: "e", kind: "item", label: "Quantité nulle", quantity: "0", unitPrice: "10", vatPercent: "20" },
            { id: "f", kind: "pending", label: "" },
            { id: "g", kind: "note", label: "Note" },
            { id: "h", kind: "item", label: "Prix négatif", quantity: "1", unitPrice: "-10", vatPercent: "20" },
            { id: "i", kind: "item", label: "Coût illisible", quantity: "1", unitPrice: "10", unitCost: "x", vatPercent: "20" },
          ],
        },
      ],
      globalDiscountPercent: "150",
    });
    const codes = r.issues.map((i) => `${i.lineId ?? "-"}:${i.code}`);
    expect(codes).toContain("a:missing");
    expect(r.issues.filter((i) => i.lineId === "a").map((i) => i.field)).toEqual(expect.arrayContaining(["label", "quantity"]));
    expect(codes).toContain("e:zero_qty");
    expect(codes).toContain("f:pending_line");
    expect(r.issues.some((i) => i.lineId === "b" && i.blocking)).toBe(true);
    expect(r.issues.find((i) => i.lineId === "c")).toMatchObject({ code: "unusual_vat", blocking: false });
    expect(r.issues.some((i) => i.lineId === "d" && i.blocking)).toBe(true);
    expect(r.issues.some((i) => i.lineId === "h" && i.blocking)).toBe(true);
    expect(r.issues.find((i) => i.field === "globalDiscountPercent")).toMatchObject({ code: "too_large", blocking: true });
    expect(r.issues.find((i) => i.lineId === "i")).toMatchObject({ field: "unitCost", blocking: true });
    expect(r.ok).toBe(false);
    // Saisie démesurée : refusée par les bornes de champ avant tout calcul.
    const huge = computeQuote({
      sections: [{ id: "s", lines: [{ id: "x", kind: "item", label: "x", quantity: "99999999", unitPrice: "99999999999", vatPercent: "20" }] }],
    });
    expect(huge.issues.some((i) => i.lineId === "x" && i.blocking)).toBe(true);
  });

  it("reprend les lignes signées et les options d'un brouillon", () => {
    const input = draftToCalcInput(
      {
        globalDiscount: "",
        sections: [
          {
            id: "s",
            title: "Lot",
            description: "",
            lines: [
              {
                id: "r",
                kind: "item",
                catalogItemId: null,
                nature: "autre",
                label: "Révision",
                description: "",
                quantity: "1",
                unit: "u",
                unitPrice: "-12",
                unitCost: "",
                discountPercent: "",
                vatPercent: "20",
                estimated: false,
                estimateNote: "",
                signed: true,
              },
              {
                id: "o",
                kind: "item",
                catalogItemId: null,
                nature: "autre",
                label: "Option",
                description: "",
                quantity: "1",
                unit: "u",
                unitPrice: "100",
                unitCost: "40",
                discountPercent: "",
                vatPercent: "20",
                estimated: false,
                estimateNote: "",
                optional: true,
              },
            ],
          },
        ],
      } as never,
      true,
    );
    expect(input.vatExempt).toBe(true);
    expect(input.sections[0].lines[0].signed).toBe(true);
    expect(input.sections[0].lines[1].optional).toBe(true);
    const r = computeQuote(input);
    expect(r.totalHtCents).toBe(-1200);
    expect(r.options).toMatchObject({ count: 1, htCents: 10000 });
  });

  it("calcule les métrés, regroupements et contrôles de saisie", () => {
    // Cotes en millimètres entiers : aucune erreur d'arrondi des nombres à virgule.
    expect(parseMetres("2,5")).toBe(2500);
    expect(parseMetres("")).toBeNull();
    expect(emptyMeasure().kind).toBe("surface");
    expect(emptyMeasure("murs").items).toHaveLength(1);
    const bad = computeMeasure({
      kind: "murs",
      items: [{ label: "Chambre", count: "1", a: "4", b: "3", c: "2,5" }],
      deductions: [{ label: "", count: "deux", a: "1", b: "2", c: "" }],
    });
    expect(bad.errors).toEqual(["Ouverture 1 : nombre invalide"]);
    const plinthes = computeMeasure({
      kind: "plinthes",
      items: [{ label: "Séjour", count: "1", a: "5", b: "4", c: "" }],
      deductions: [{ label: "Porte", count: "1", a: "", b: "", c: "" }],
    });
    expect(plinthes.errors[0]).toContain("largeur à renseigner");
    expect(sanitizeMeasure("rien")).toBeNull();
    expect(sanitizeMeasure({ kind: "piscine" })).toBeNull();
    expect(sanitizeMeasure({ kind: "lineaire", items: [null, { label: 3, count: "2", a: "1,5" }], deductions: "x" })).toEqual({
      kind: "lineaire",
      items: [
        { label: "", count: "", a: "", b: "", c: "" },
        { label: "3", count: "2", a: "1,5", b: "", c: "" },
      ],
      deductions: [],
    });
    expect(parseMetres(undefined)).toBeNull();
    expect(parseMetres("-2")).toBeNull();
    expect(computeMeasure({ kind: "inconnu" as never, items: [], deductions: [] }).errors).toEqual(["Type de métré inconnu"]);
    const many = Array.from({ length: 61 }, () => ({ label: "", count: "", a: "1", b: "", c: "" }));
    const big = computeMeasure({ kind: "lineaire", items: many, deductions: [] });
    expect(big.errors).toContain("60 rangées au plus");
    expect(computeMeasure({ kind: "lineaire", items: [{ label: "", count: undefined as never, a: "3", b: "", c: "" }], deductions: [] }).quantity).toBe("3");
    const noHeight = computeMeasure({
      kind: "murs",
      items: [{ label: "Pièce", count: "1", a: "4", b: "3", c: "2,5" }],
      deductions: [{ label: "Fenêtre", count: "1", a: "1,2", b: "", c: "" }],
    });
    expect(noHeight.errors).toEqual(["Fenêtre : largeur et hauteur à renseigner, en mètres"]);
    expect(computeMeasure({ kind: "lineaire", items: [{ label: "", count: "", a: "2", b: "", c: "" }], deductions: [] }).quantity).toBe("2");
    const runs = groupRuns(
      [
        { id: "a", group: "A", lines: [{ kind: "note" }] },
        { id: "b", group: "A", lines: [{ kind: "item" }] },
      ],
      () => 5,
    );
    expect(runs).toEqual([{ group: "A", start: 0, end: 1, cents: 10, items: true }]);
    expect(runAt(runs, 1)?.group).toBe("A");
  });
});
