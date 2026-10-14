import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { createItem, getItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { compareSuppliers, switchSupplier } from "@/lib/services/supplier-compare";
import { importSupplierPrices } from "@/lib/services/supplier-prices";
import { annualSavingCents, productKey, rankOffers } from "@/lib/supplier-compare";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("rapprochement des offres", () => {
  it("reconnaît un produit par son EAN ou sa désignation", () => {
    expect(productKey({ ean: "3 270 190 012 345", label: "x", unit: "u" })).toBe("ean:3270190012345");
    expect(productKey({ label: "Colle carrelage C2 25 kg", unit: "SAC" })).toBe(productKey({ label: "colle C2 carrelage 25 kg", unit: "sac" }));
    const offers = [
      { id: "1", supplier: "Cedeo", reference: "A", ean: "", label: "", unit: "", net4: 230000 },
      { id: "2", supplier: "Point P", reference: "B", ean: "", label: "", unit: "", net4: 210000 },
      { id: "3", supplier: "Point P", reference: "C", ean: "", label: "", unit: "", net4: 205000 },
      { id: "4", supplier: "Négoce Rhône", reference: "D", ean: "", label: "", unit: "", net4: 100000 },
    ];
    expect(rankOffers("Négoce Rhône", 240000, offers).map((o) => [o.id, o.gapBp])).toEqual([
      ["3", -1458],
      ["1", -417],
    ]);
    expect(annualSavingCents(120000, 240000, 205000)).toBe(42000);
    expect(annualSavingCents(120000, 200000, 205000)).toBe(0);
  });
});

describe("comparateur du catalogue", () => {
  let db: Database;
  let ctx: Ctx;
  let colle: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "comparateur@exemple.fr");
    await completeProfile(ctx);
    colle = await createItem(ctx, {
      name: "Colle C2",
      category: "materiau",
      vat_percent: "20",
      unit: "sac",
      unit_cost: "24",
      unit_price: "35",
      supplier: "Négoce Rhône",
      supplier_ref: "CK-2040",
    });
    await createItem(ctx, {
      name: "Joint gris",
      category: "materiau",
      vat_percent: "20",
      unit: "sac",
      unit_cost: "9",
      unit_price: "15",
      supplier: "Négoce Rhône",
    });
    await importSupplierPrices(
      ctx,
      { supplier: "Négoce Rhône", minMarginPercent: "0" },
      [
        ["REFCIALE", "EAN", "LIBELLE240", "UB", "PRIX NET"],
        ["CK-2040", "3270190012345", "Colle carrelage C2 25 kg", "SAC", "24"],
      ],
      true,
    );
    await importSupplierPrices(
      ctx,
      { supplier: "Cedeo", minMarginPercent: "0" },
      [
        ["REFCIALE", "EAN", "LIBELLE240", "UB", "PRIX NET"],
        ["COL-25", "3270190012345", "Mortier colle C2 sac 25 kg", "SAC", "21,50"],
        ["JNT-5", "", "Joint gris", "SAC", "9,40"],
      ],
      true,
    );
    // 40 sacs vendus dans un devis accepté.
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Carrelage",
        sections: [{ ...d.sections[0], lines: [line({ catalogItemId: colle, nature: "materiau", label: "Colle C2", quantity: "40", unit: "sac" })] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  });

  it("trouve les offres moins chères et chiffre l'économie annuelle", async () => {
    const r = await compareSuppliers(ctx);
    expect(r.suppliers).toBe(2);
    expect(r.items.map((i) => [i.name, i.matchedBy, i.offers[0].supplier, i.offers[0].net4, i.cheaper, i.savingCents])).toEqual([
      ["Colle C2", "ean", "Cedeo", 215000, true, 10000],
      ["Joint gris", "libelle", "Cedeo", 94000, false, 0],
    ]);
    expect(r.savingCents).toBe(10000);
  });

  it("change de fournisseur en gardant l'historique", async () => {
    const offer = (await compareSuppliers(ctx)).items[0].offers[0];
    const res = await switchSupplier(ctx, colle, offer.id);
    expect(res).toMatchObject({ supplier: "Cedeo", oldCost4: 240000, newCost4: 215000 });
    const it = await getItem(ctx, colle);
    expect([it.supplier, it.supplier_ref, it.unit_cost4]).toEqual(["Cedeo", "COL-25", 215000]);
    await expect(switchSupplier(ctx, colle, offer.id)).rejects.toMatchObject({ status: 409 });
    // Désormais chez Cedeo, la colle n'a plus d'offre moins chère, l'ancien fournisseur reste visible.
    const after = (await compareSuppliers(ctx)).items.find((i) => i.name === "Colle C2")!;
    expect([after.offers[0].supplier, after.cheaper]).toEqual(["Négoce Rhône", false]);
    const other = await signUp(db, "comparateur-autre@exemple.fr", "Autre");
    await expect(switchSupplier(other, colle, offer.id)).rejects.toMatchObject({ status: 404 });
  });
});
