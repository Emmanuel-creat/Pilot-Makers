import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { alternativesFor, lifecycleGrams } from "@/lib/biosourced";
import type { Ctx } from "@/lib/services/context";
import { addBiosourcedVariant, quoteAlternatives } from "@/lib/services/biosourced";
import { createQuote, getDraft, saveDraft } from "@/lib/services/quotes";
import { freshDb, line, makeCustomer, signUp } from "./helpers";

describe("alternatives biosourcées", () => {
  it("cycle de vie sur 50 ans : chaque remplacement compte", () => {
    expect(lifecycleGrams(1000, 50, 2)).toBe(2000);
    expect(lifecycleGrams(1000, 30, 2)).toBe(4000);
    expect(lifecycleGrams(500, 10, 1)).toBe(2500);
  });

  it("propose fibre de bois, ouate et chanvre pour la laine de verre, triées par gain", () => {
    const a = alternativesFor("Isolation laine de verre 200 mm", "m²", 50)!;
    expect(a.conventional).toMatchObject({ label: "Laine de verre", lifecycleGrams: 100_000 });
    expect(a.alternatives.map((x) => x.id)).toEqual(["ouate-cellulose", "laine-chanvre", "fibre-bois"]);
    expect(a.alternatives[0]).toMatchObject({ lifecycleGrams: 30_000, savedGrams: 70_000, storedTotalGrams: 125_000 });
  });

  it("une fenêtre PVC remplacée au bout de 30 ans face à une fenêtre bois", () => {
    const a = alternativesFor("Fenêtre PVC double vitrage", "u", 4)!;
    expect(a.conventional.lifecycleGrams).toBe(800_000);
    expect(a.alternatives[0]).toMatchObject({ id: "fenetre-bois", lifecycleGrams: 240_000, savedGrams: 560_000 });
  });

  it("utilise l'empreinte du catalogue quand elle est connue ; rien pour un matériau déjà biosourcé", () => {
    expect(alternativesFor("Laine de verre", "m²", 10, 3_000)!.conventional.lifecycleGrams).toBe(30_000);
    expect(alternativesFor("Enduit chaux chanvre", "m²", 10)).toBeNull();
    expect(alternativesFor("Fenêtre bois", "u", 1)).toBeNull();
    expect(alternativesFor("Pose de carrelage", "m²", 10)).toBeNull();
    expect(alternativesFor("Laine de verre", "u", 10)).toBeNull();
  });
});

describe("variante biosourcée dans le devis", () => {
  let db: Database;
  let ctx: Ctx;
  let quoteId: string;
  let lineId: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "isolation@exemple.fr", "Isolation Martin");
    const customerId = await makeCustomer(ctx);
    quoteId = await createQuote(ctx, { customerId, title: "Isolation des combles" });
    const draft = await getDraft(ctx, quoteId);
    const isolant = line({ nature: "materiau", label: "Laine de verre 300 mm", quantity: "60", unit: "m²", unitPrice: "18" });
    lineId = isolant.id;
    await saveDraft(
      ctx,
      quoteId,
      { ...draft, sections: [{ ...draft.sections[0], lines: [isolant, line({ label: "Pose de l'isolant", quantity: "60", unit: "m²" })] }] },
      draft.draftRevision,
    );
  });

  it("liste les lignes concernées puis ajoute la variante en option, après la ligne d'origine", async () => {
    const alts = await quoteAlternatives(ctx, quoteId);
    expect(alts.map((a) => [a.lineId, a.hasVariant])).toEqual([[lineId, false]]);
    await addBiosourcedVariant(ctx, quoteId, lineId, "ouate-cellulose");
    await expect(addBiosourcedVariant(ctx, quoteId, lineId, "ouate-cellulose")).rejects.toThrow(/déjà/);
    await expect(addBiosourcedVariant(ctx, quoteId, lineId, "inconnue")).rejects.toThrow(/inconnue/);
    const lines = (await getDraft(ctx, quoteId)).sections[0].lines;
    expect(lines.map((l) => l.label)).toEqual(["Laine de verre 300 mm", "Variante biosourcée : Ouate de cellulose soufflée", "Pose de l'isolant"]);
    expect(lines[1]).toMatchObject({ optional: true, quantity: "60", unit: "m²", unitPrice: "", estimated: true, estimateNote: "Prix à compléter" });
    expect(lines[1].description).toContain("tassement");
    expect((await quoteAlternatives(ctx, quoteId))[0].hasVariant).toBe(true);
  });
});
