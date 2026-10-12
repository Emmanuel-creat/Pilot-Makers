import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { bulkAdjustPrices, createItem, getItem, updateItem, itemToInput } from "@/lib/services/catalog";
import { compositionTotals, listComponents, setComponents } from "@/lib/services/ouvrages";
import { getDraft, saveDraft, createQuote } from "@/lib/services/quotes";
import { createQuoteFromTemplate, deleteTemplate, listTemplates, saveQuoteAsTemplate } from "@/lib/services/templates";
import { freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let other: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "modeles@exemple.fr");
  other = await signUp(db, "autre@exemple.fr", "Autre entreprise");
});

describe("ouvrages composés", () => {
  let receveur: string;
  let pose: string;
  let ouvrage: string;

  it("calcule prix et coût depuis les composants", async () => {
    receveur = await createItem(ctx, { name: "Receveur extra-plat", unit: "u", unit_price: "189", unit_cost: "120", category: "materiau", vat_percent: "10" });
    pose = await createItem(ctx, { name: "Pose plomberie", unit: "h", unit_price: "48", unit_cost: "30", vat_percent: "10" });
    ouvrage = await createItem(ctx, { name: "Douche à l'italienne", unit: "u", unit_price: "0", vat_percent: "10" });
    await setComponents(ctx, ouvrage, [
      { itemId: receveur, quantity: "1" },
      { itemId: pose, quantity: "3,5" },
    ]);
    const it = await getItem(ctx, ouvrage);
    expect(it.kind).toBe("ouvrage");
    expect(it.unit_price4).toBe((189 + 48 * 3.5) * 10000);
    expect(it.unit_cost4).toBe((120 + 30 * 3.5) * 10000);
    expect(it.composition_text).toBe("Comprend : 1 u Receveur extra-plat ; 3,5 h Pose plomberie");
  });

  it("suit les changements de prix des composants", async () => {
    await updateItem(ctx, pose, { ...itemToInput(await getItem(ctx, pose)), unit_price: "50" });
    expect((await getItem(ctx, ouvrage)).unit_price4).toBe((189 + 50 * 3.5) * 10000);
    await bulkAdjustPrices(ctx, [receveur, ouvrage], "10");
    // L'ouvrage n'est pas majoré deux fois : seul le receveur change, l'ouvrage suit.
    expect((await getItem(ctx, ouvrage)).unit_price4).toBe((207.9 + 50 * 3.5) * 10000);
  });

  it("refuse les boucles, les doublons et les prestations d'une autre entreprise", async () => {
    await expect(setComponents(ctx, ouvrage, [{ itemId: ouvrage, quantity: "1" }])).rejects.toMatchObject({ status: 400 });
    await expect(setComponents(ctx, receveur, [{ itemId: pose, quantity: "1" }])).rejects.toMatchObject({ status: 400 });
    const nested = await createItem(ctx, { name: "Salle d'eau complète", unit: "u", unit_price: "0", vat_percent: "10" });
    await expect(setComponents(ctx, nested, [{ itemId: ouvrage, quantity: "1" }])).rejects.toMatchObject({ status: 400 });
    await expect(setComponents(ctx, nested, [{ itemId: pose, quantity: "1" }, { itemId: pose, quantity: "2" }])).rejects.toMatchObject({ status: 400 });
    const foreign = await createItem(other, { name: "Pose", unit_price: "10", vat_percent: "10" });
    await expect(setComponents(ctx, nested, [{ itemId: foreign, quantity: "1" }])).rejects.toMatchObject({ status: 400 });
    await expect(setComponents(other, ouvrage, [])).rejects.toMatchObject({ status: 404 });
  });

  it("redevient une prestation simple sans composants", async () => {
    await setComponents(ctx, ouvrage, []);
    expect((await getItem(ctx, ouvrage)).kind).toBe("simple");
    expect(await listComponents(db, ctx.orgId, ouvrage)).toEqual([]);
  });

  it("arrondit chaque composant au dix-millième", () => {
    expect(compositionTotals([{ unit_price4: 33333, quantity_milli: 1500, unit_cost4: null }])).toEqual({ unitPrice4: 50000, unitCost4: null });
  });
});

describe("modèles de devis", () => {
  it("enregistre un devis comme modèle et en crée un nouveau devis indépendant", async () => {
    const q = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, q);
    const sectionId = d.sections[0].id;
    await saveDraft(
      ctx,
      q,
      { ...d, title: "Salle de bain", specialConditions: "Accès au chantier par la cour", sections: [{ id: sectionId, title: "Sol", description: "", lines: [line(), line({ label: "Plinthes" })] }] },
      d.draftRevision,
    );
    const t = await saveQuoteAsTemplate(ctx, q, { name: "Salle de bain type" });
    await expect(saveQuoteAsTemplate(ctx, q, { name: "salle de bain TYPE" })).rejects.toMatchObject({ status: 409 });
    expect((await listTemplates(ctx))[0]).toMatchObject({ id: t, line_count: 2 });
    expect(await listTemplates(other)).toEqual([]);

    const fromT = await createQuoteFromTemplate(ctx, t);
    const n = await getDraft(ctx, fromT);
    expect(n.customerId).toBeNull();
    expect(n.title).toBe("Salle de bain");
    expect(n.specialConditions).toBe("Accès au chantier par la cour");
    expect(n.sections[0].lines.map((l) => l.label)).toEqual(["Pose de carrelage", "Plinthes"]);
    expect(n.sections[0].id).not.toBe(sectionId);
    expect((await listTemplates(ctx))[0].usage_count).toBe(1);
    await expect(createQuoteFromTemplate(other, t)).rejects.toMatchObject({ status: 404 });
    await deleteTemplate(ctx, t);
    expect(await listTemplates(ctx)).toEqual([]);
  });
});
