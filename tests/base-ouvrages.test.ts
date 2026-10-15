import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { compositionText, parseComposition, workSchema } from "@/lib/open-works";
import type { Ctx } from "@/lib/services/context";
import { getWork, importWork, listWorks, openDataExport, publishWork, reportWork, toggleWorkVote, updateWork, workContext } from "@/lib/services/open-works";
import { completeProfile, freshDb, signUp } from "./helpers";

const fiche = {
  trade: "carrelage",
  title: "Carrelage grès cérame 60x60 collé sur chape",
  unit: "m²",
  description: "Contrôle de planéité, primaire si besoin, double encollage, pose à la règle, joints après 24 heures.",
  composition: [
    { label: "Carreau grès cérame 60x60", quantity: "1,05", unit: "m²" },
    { label: "Mortier-colle C2", quantity: "5", unit: "kg" },
  ],
  labourMinutes: 45,
  refs: "NF DTU 52.2",
};

describe("fiches de la base ouverte", () => {
  it("composition saisie ligne par ligne", () => {
    expect(parseComposition("1,05 ; m² ; Carreau grès\n\n5;kg;Mortier-colle C2\nabc")).toEqual({
      components: [
        { label: "Carreau grès", quantity: "1,05", unit: "m²" },
        { label: "Mortier-colle C2", quantity: "5", unit: "kg" },
      ],
      errors: [4],
    });
    expect(compositionText(fiche.composition, "m²")).toBe("Composition par m² : Carreau grès cérame 60x60 1,05 m², Mortier-colle C2 5 kg.");
  });

  it("jamais de prix dans une fiche", () => {
    expect(workSchema.safeParse(fiche).success).toBe(true);
    expect(workSchema.safeParse({ ...fiche, description: `${fiche.description} Compter 45 € le m².` }).success).toBe(false);
    expect(workSchema.safeParse({ ...fiche, title: "Carrelage à 40 euros" }).success).toBe(false);
  });
});

describe("partage entre artisans", () => {
  let db: Database;
  let a: Ctx;
  let b: Ctx;
  let id: string;

  beforeAll(async () => {
    db = await freshDb();
    a = await signUp(db, "auteur@exemple.fr", "Carrelage Martin");
    await completeProfile(a);
    b = await signUp(db, "lecteur@exemple.fr", "Sols Durand");
  });

  it("publication lisible par tous, sans nom d'entreprise", async () => {
    id = await publishWork(a, fiche);
    const list = await listWorks(db, { trade: "carrelage" });
    expect(list).toEqual([expect.objectContaining({ id, title: fiche.title, labourMinutes: 45, votes: 0, imports: 0 })]);
    expect(list[0].author).toMatch(/, 69$/);
    expect(await listWorks(db, { search: "chape" })).toHaveLength(1);
    expect(await listWorks(db, { trade: "peinture" })).toHaveLength(0);
    const data = await openDataExport(db);
    expect(data.license.name).toBe("Licence Ouverte 2.0");
    expect(JSON.stringify(data)).not.toContain("Martin");
  });

  it("seul l'auteur modifie ; les autres publient une version dérivée", async () => {
    await expect(updateWork(b, id, { ...fiche, labourMinutes: 30 })).rejects.toThrow(/version dérivée/);
    await updateWork(a, id, { ...fiche, labourMinutes: 40 });
    expect((await getWork(db, id)).labourMinutes).toBe(40);
    const derived = await publishWork(b, { ...fiche, title: "Carrelage grès 60x60 en pose scellée", labourMinutes: 60 }, id);
    expect((await getWork(db, derived)).derivedFrom).toBe(id);
  });

  it("vote, reprise dans le catalogue sans prix, une seule fois", async () => {
    await expect(toggleWorkVote(a, id)).rejects.toThrow(/votre entreprise/);
    expect(await toggleWorkVote(b, id)).toBe(true);
    const itemId = await importWork(b, id);
    await expect(importWork(b, id)).rejects.toThrow(/déjà/);
    const [item] = await db.query<{ name: string; unit: string; unit_price4: unknown; duration_minutes: unknown; description: string; org_id: string }>(
      "SELECT name, unit, unit_price4, duration_minutes, description, org_id FROM catalog_items WHERE id=$1",
      [itemId],
    );
    expect(item).toMatchObject({ name: fiche.title, unit: "m²", org_id: b.orgId });
    expect(Number(item.unit_price4)).toBe(0);
    expect(Number(item.duration_minutes)).toBe(40);
    expect(item.description).toContain("Composition par m²");
    expect(item.description).toContain("NF DTU 52.2");
    expect(await workContext(b, id)).toEqual({ mine: false, voted: true, importedItemId: itemId });
    expect((await getWork(db, id)).imports).toBe(1);
  });

  it("trois signalements masquent la fiche", async () => {
    await expect(reportWork(a, id, "publicite")).rejects.toThrow(/votre entreprise/);
    await reportWork(b, id, "copie");
    await reportWork(await signUp(db, "c@exemple.fr"), id, "copie");
    expect((await reportWork(await signUp(db, "d@exemple.fr"), id, "copie")).hidden).toBe(true);
    await expect(getWork(db, id)).rejects.toThrow(/introuvable/);
  });
});
