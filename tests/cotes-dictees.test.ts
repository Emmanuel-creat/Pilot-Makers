import { describe, expect, it } from "vitest";
import { parseSpokenMeasure } from "@/lib/spoken-measure";

const dims = (t: string) => {
  const r = parseSpokenMeasure(t);
  return r ? [r.item.a, r.item.b, r.item.c].filter(Boolean) : null;
};

describe("cotes dictées", () => {
  it("comprend les chiffres et les lettres", () => {
    expect(dims("3,20 par 2,10")).toEqual(["3,20", "2,10"]);
    expect(dims("3.2 x 2.1")).toEqual(["3,2", "2,1"]);
    expect(dims("trois mètres vingt par deux mètres dix")).toEqual(["3,20", "2,10"]);
    expect(dims("trois mètres cinq sur quatre mètres")).toEqual(["3,05", "4"]);
    expect(dims("deux virgule cinq par un virgule zéro cinq")).toEqual(["2,5", "1,05"]);
    expect(dims("quatre-vingts centimètres par deux mètres quinze")).toEqual(["0,8", "2,15"]);
    expect(dims("soixante-dix centimètres")).toEqual(["0,7"]);
    expect(dims("quatre-vingt-douze centimètres")).toEqual(["0,92"]);
    expect(dims("vingt et un mètres")).toEqual(["21"]);
    expect(dims("cent vingt mètres")).toEqual(["120"]);
  });

  it("lit le libellé, la hauteur et le nombre de répétitions", () => {
    expect(parseSpokenMeasure("Cuisine 4 mètres 10 par 3 mètres 20 hauteur 2 mètres 50")).toEqual({
      deduction: false,
      item: { label: "Cuisine", count: "1", a: "4,10", b: "3,20", c: "2,50" },
    });
    expect(parseSpokenMeasure("deux fois fenêtre 1,20 par 1,35")).toEqual({
      deduction: true,
      item: { label: "fenêtre", count: "2", a: "1,20", b: "1,35", c: "" },
    });
    expect(parseSpokenMeasure("porte 90 centimètres par 2 mètres 4")?.item).toMatchObject({ a: "0,9", b: "2,04" });
  });

  it("ne garde que trois dimensions et refuse une phrase sans cote", () => {
    expect(dims("1 par 2 par 3 par 4")).toEqual(["1", "2", "3"]);
    expect(parseSpokenMeasure("salle de bain")).toBeNull();
    expect(parseSpokenMeasure("")).toBeNull();
  });
});
