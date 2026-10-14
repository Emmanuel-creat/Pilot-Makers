import { describe, expect, it } from "vitest";
import { deleteFinancing, financingPdf, getFinancing, listFinancing, saveFinancing, setFinancingStatus } from "@/lib/services/financing";
import { burden, dossierChecks, monthlyPayment, simulate } from "@/lib/financing";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("financement d'équipement", () => {
  it("calcule la mensualité d'un financement", () => {
    // 30 000 € sur 48 mois à 5 % : 690,88 €.
    expect(monthlyPayment(3_000_000, 48, 500)).toBe(69_088);
    expect(monthlyPayment(1_200_000, 12, 0)).toBe(100_000);
    expect(monthlyPayment(0, 12, 500)).toBe(0);
    // Avec une option d'achat de 3 000 €, la mensualité baisse.
    expect(monthlyPayment(3_000_000, 48, 500, 300_000)).toBeLessThan(69_088);
  });
  it("simule les durées usuelles avec apport et valeur résiduelle", () => {
    const s = simulate(3_000_000, 500_000, 0, 1000, [25]);
    expect(s).toEqual([{ months: 25, monthlyCents: 88_000, totalCents: 3_000_000, costCents: 0 }]);
    const [a, b] = simulate(3_000_000, 0, 550, 0, [36, 60]);
    expect(a.monthlyCents).toBeGreaterThan(b.monthlyCents);
    expect(b.costCents).toBeGreaterThan(a.costCents);
  });
  it("mesure le poids de la mensualité et les pièces manquantes", () => {
    expect(burden(100_000, 24_000_000)).toBe(5);
    expect(burden(100_000, 0)).toBeNull();
    const c = dossierChecks({ siret: "123 456 789 00012", legalForm: "SARL", yearsOfRevenue: 0, quoteRef: "", supplier: "Renault", insurer: "" });
    expect(c.filter((x) => !x.ok).map((x) => x.key)).toEqual(["ca", "devis", "assurance"]);
  });
});

describe("demandes de financement", () => {
  it("enregistre, simule, produit le dossier et suit la réponse", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "financement@exemple.fr");
    await completeProfile(ctx);
    const base = { label: "Fourgon 3,5 t", category: "vehicule", kind: "credit_bail", months: "48", supplier: "Garage du Rhône", quoteRef: "DV-2210" };
    await expect(saveFinancing(ctx, null, { ...base, amount: "" })).rejects.toMatchObject({ status: 400 });
    await expect(saveFinancing(ctx, null, { ...base, amount: "1000", down: "1000" })).rejects.toMatchObject({ status: 400 });
    const id = await saveFinancing(ctx, null, { ...base, amount: "32 000", down: "2000", rate: "5", residual: "" });
    const d = await getFinancing(ctx, id);
    expect(d.request).toMatchObject({ amountCents: 3_200_000, downCents: 200_000, rateBp: 500, residualBp: 0 });
    expect(d.chosen.monthlyCents).toBe(69_088);
    expect(d.simulations).toHaveLength(5);
    expect(d.checks.find((c) => c.key === "devis")?.ok).toBe(true);
    const pdf = await financingPdf(ctx, id);
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    await setFinancingStatus(ctx, id, "envoyee");
    await expect(setFinancingStatus(ctx, id, "perdue")).rejects.toMatchObject({ status: 400 });
    expect((await listFinancing(ctx))[0].status).toBe("envoyee");
    await deleteFinancing(ctx, id);
    expect(await listFinancing(ctx)).toEqual([]);
  });
});
