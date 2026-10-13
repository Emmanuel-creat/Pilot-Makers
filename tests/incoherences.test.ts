import { describe, expect, it } from "vitest";
import { findAnomalies, type AnomalyLine } from "@/lib/services/anomalies";

const l = (p: Partial<AnomalyLine>): AnomalyLine => ({
  id: p.label ?? "x",
  kind: "item",
  nature: "main_oeuvre",
  label: "Pose de carrelage",
  quantity: "20",
  unit: "m²",
  unit_price: "45",
  unit_cost: "",
  vat_percent: "10",
  ...p,
});
const codes = (lines: AnomalyLine[], vatApplies = true) => findAnomalies(lines, { vatApplies }).map((a) => `${a.lineId}:${a.code}`);

describe("incohérences d'un devis", () => {
  it("un devis ordinaire ne signale rien", () => {
    expect(
      codes([l({}), l({ label: "Plinthes", unit: "ml", quantity: "32,5", unit_price: "12" }), l({ label: "Nettoyage", unit: "forfait", quantity: "1" })]),
    ).toEqual([]);
  });

  it("repère les quantités anormales", () => {
    expect(codes([l({ label: "Carrelage", quantity: "12000" })])).toEqual(["Carrelage:quantity_high"]);
    expect(codes([l({ label: "Robinet", unit: "u", quantity: "2,5" })])).toEqual(["Robinet:quantity_fraction"]);
    expect(
      codes([l({ label: "Inconnue", unit: "palette", quantity: "99999" }), l({ label: "Vide", quantity: "" }), l({ label: "Bizarre", quantity: "abc" })]),
    ).toEqual([]);
  });

  it("repère les prix hors norme", () => {
    expect(codes([l({ label: "A", unit_price: "30", unit_cost: "35" })])).toEqual(["A:price_below_cost"]);
    expect(codes([l({ label: "B", unit_price: "450", unit_cost: "45" })])).toEqual(["B:price_coefficient"]);
    expect(codes([l({ label: "C", unit: "h", unit_price: "450" })])).toEqual(["C:price_labour"]);
    expect(codes([l({ label: "D", unit: "j", unit_price: "1200" })])).toEqual([]);
    expect(
      codes([
        l({ id: "1", label: "Faïence" }),
        l({ id: "2", label: "faience ", unit_price: "4,5" }),
        l({ id: "3", label: "Faïence", unit: "u", unit_price: "200" }),
      ]),
    ).toEqual(["2:price_same_label"]);
    expect(codes([l({ id: "1", label: "" }), l({ id: "2", label: "", unit_price: "400" })])).toEqual([]);
    expect(codes([l({ label: "Révision", unit_price: "-30", signed: true }), l({ label: "Note", kind: "note", unit_price: "1" })])).toEqual([]);
  });

  it("repère les taux de TVA inadaptés", () => {
    expect(codes([l({ label: "Pose de carrelage", vat_percent: "5,5" })])).toEqual(["Pose de carrelage:vat_energy"]);
    expect(codes([l({ label: "Isolation des combles", vat_percent: "5,5" })])).toEqual([]);
    expect(codes([l({ label: "Pompe à chaleur", nature: "materiau", vat_percent: "5,5" })])).toEqual(["Pompe à chaleur:vat_supply_only"]);
    expect(codes([l({ label: "Pompe à chaleur", nature: "materiau", vat_percent: "5,5" }), l({ label: "Pose", vat_percent: "10" })])).toEqual([]);
    expect(codes([l({ label: "Livre", vat_percent: "2,1" })])).toEqual(["Livre:vat_special"]);
    expect(codes([l({ label: "Exonéré", vat_percent: "0" })])).toEqual(["Exonéré:vat_zero"]);
    // Franchise en base ou autoliquidation : la TVA n'est pas facturée, rien à contrôler.
    expect(codes([l({ label: "Exonéré", vat_percent: "0" })], false)).toEqual([]);
  });

  it("des messages lisibles, même sans désignation", () => {
    const [a] = findAnomalies([l({ label: "", unit_price: "30", unit_cost: "35" })], { vatApplies: true });
    expect(a.message).toBe("Une ligne sans désignation : vendue 30 € pour un coût de 35 €, donc à perte.");
  });
});
