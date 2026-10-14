import { beforeAll, describe, expect, it } from "vitest";
import { defaultFactor, formatCarbon, lineCarbon, quoteCarbonBalance } from "@/lib/carbon";
import type { Database } from "@/lib/db";
import { createItem } from "@/lib/services/catalog";
import { getItemCarbon, quoteCarbon, setItemCarbon } from "@/lib/services/carbon";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("facteurs carbone", () => {
  it("reconnaît les produits courants selon la désignation et l'unité", () => {
    expect(defaultFactor("Fenêtre aluminium 2 vantaux", "u")?.label).toBe("Fenêtre aluminium");
    expect(defaultFactor("Fenêtres PVC double vitrage", "U")?.label).toBe("Fenêtre PVC");
    expect(defaultFactor("Faïence murale 30x60", "m²")?.grams).toBe(15_000);
    // Une unité inattendue ne reçoit pas de valeur au hasard.
    expect(defaultFactor("Faïence murale 30x60", "u")).toBeNull();
    expect(lineCarbon({ label: "Pose", unit: "h", quantityMilli: 8000, nature: "main_oeuvre", itemGrams: null }).origin).toBe("sans_objet");
    expect(lineCarbon({ label: "Colle C2", unit: "sac", quantityMilli: 4000, nature: "materiau", itemGrams: 9_500 })).toEqual({
      grams: 38_000,
      origin: "catalogue",
      factorGrams: 9_500,
    });
    expect(formatCarbon(1_234_000)).toBe("1,23 t CO2e");
    expect(formatCarbon(5_250)).toBe("5,3 kg CO2e");
  });

  it("dresse le bilan avec la part estimée et les lignes sans donnée", () => {
    const b = quoteCarbonBalance([
      { label: "Faïence murale", unit: "m²", quantityMilli: 20_000, nature: "materiau", itemGrams: null },
      { label: "Receveur extra-plat", unit: "u", quantityMilli: 1000, nature: "materiau", itemGrams: 55_000 },
      { label: "Joint époxy", unit: "kg", quantityMilli: 5000, nature: "materiau", itemGrams: null },
      { label: "Pose", unit: "m²", quantityMilli: 20_000, nature: "main_oeuvre", itemGrams: null },
    ]);
    expect([b.grams, b.estimatedGrams, b.unknown, b.covered, b.products]).toEqual([355_000, 300_000, ["Joint époxy"], 2, 3]);
    expect(b.top.map((t) => [t.label, t.shareBp])).toEqual([
      ["Faïence murale", 8451],
      ["Receveur extra-plat", 1549],
    ]);
  });
});

describe("empreinte du catalogue et bilan du devis", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "carbone@exemple.fr");
    await completeProfile(ctx);
  });

  it("enregistre le facteur d'un article et l'applique au devis", async () => {
    const receveur = await createItem(ctx, { name: "Receveur extra-plat", unit: "u", unit_price: "189", category: "materiau", vat_percent: "10" });
    expect(await getItemCarbon(ctx, receveur)).toMatchObject({ grams: null, suggestion: { grams: 40_000 } });
    await expect(setItemCarbon(ctx, receveur, { kg: "beaucoup" })).rejects.toMatchObject({ status: 400 });
    expect(await setItemCarbon(ctx, receveur, { kg: "55", source: "fdes" })).toBe(55_000);
    expect(await getItemCarbon(ctx, receveur)).toMatchObject({ grams: 55_000, source: "fdes" });
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        sections: [
          {
            ...d.sections[0],
            lines: [
              line({ catalogItemId: receveur, nature: "materiau", label: "Receveur extra-plat", quantity: "2", unit: "u" }),
              line({ nature: "materiau", label: "Faïence murale", quantity: "10", unit: "m²" }),
              line({ nature: "materiau", label: "Baignoire balnéo", quantity: "1", unit: "u", optional: true }),
            ],
          },
        ],
      },
      d.draftRevision,
    );
    const b = await quoteCarbon(ctx, id);
    expect([b.grams, b.estimatedGrams]).toEqual([260_000, 150_000]);
    expect(await setItemCarbon(ctx, receveur, { kg: "" })).toBeNull();
    const other = await signUp(db, "carbone-autre@exemple.fr", "Autre");
    await expect(quoteCarbon(other, id)).rejects.toMatchObject({ status: 404 });
    await expect(setItemCarbon(other, receveur, { kg: "1" })).rejects.toMatchObject({ status: 404 });
  });
});
