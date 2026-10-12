import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { catalogCsv, createItem, getItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { getOrganization, savePricing } from "@/lib/services/organization";
import { coefficientToBp, priceFromCost, readPricing, withWaste } from "@/lib/services/pricing";
import { createQuote, getDraft, getVersion, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "coefficients@exemple.fr");
  await completeProfile(ctx);
});

describe("coefficients de vente et chutes", () => {
  it("calcule le prix depuis le coût et la quantité avec les chutes", () => {
    expect(coefficientToBp("1,3", "x")).toBe(13000);
    expect(coefficientToBp("", "x")).toBe(0);
    expect(() => coefficientToBp("0,8", "Matériaux")).toThrow(/entre 1 et 10/);
    expect(priceFromCost("12,40", 13000)).toBe("16,12");
    expect(priceFromCost("", 13000)).toBeNull();
    expect(withWaste("6", "10")).toBe("6,6");
    expect(withWaste("14,5", "10")).toBe("15,95");
    expect(withWaste("3,333", "10")).toBe("3,67");
    expect(withWaste("", "10")).toBeNull();
  });

  it("enregistre les coefficients par famille", async () => {
    await savePricing(ctx, { rates: [], perKm: "", fixed: "", freeKm: "", coefficients: { materiau: "1,30", sous_traitance: "1,15", autre: "" } });
    expect(readPricing((await getOrganization(ctx)).pricing).coefficients).toEqual({ materiau: 13000, sous_traitance: 11500 });
    await expect(savePricing(ctx, { rates: [], perKm: "", fixed: "", freeKm: "", coefficients: { materiau: "abc" } })).rejects.toMatchObject({
      status: 400,
    });
  });

  it("garde le taux de chutes du catalogue sur la ligne, sans l'imprimer", async () => {
    const itemId = await createItem(ctx, {
      name: "Carrelage grès cérame",
      category: "materiau",
      unit: "m²",
      unit_price: "35",
      vat_percent: "10",
      waste_percent: "10",
    });
    expect((await getItem(ctx, itemId)).waste_bp).toBe(1000);
    await expect(createItem(ctx, { name: "Trop", unit_price: "1", vat_percent: "20", waste_percent: "60" })).rejects.toMatchObject({ status: 400 });
    expect((await catalogCsv(ctx)).split("\n")[0]).toContain("waste_percent");

    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Sol",
        site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
        paymentTerms: "Solde à réception de facture.",
        sections: [
          { id: d.sections[0].id, title: "", description: "", lines: [line({ catalogItemId: itemId, wastePercent: "10", nature: "materiau" })] },
        ],
      },
      d.draftRevision,
    );
    expect((await getDraft(ctx, id)).sections[0].lines[0].wastePercent).toBe("10");
    await issueQuote(ctx, id);
    const snap = (await getVersion(db, ctx.orgId, id, 1)).snapshot;
    expect("wastePercent" in snap.sections[0].lines[0]).toBe(false);
  });
});
