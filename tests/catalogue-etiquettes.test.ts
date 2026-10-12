import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import {
  catalogCsv,
  createItem,
  getItem,
  importCatalogCsv,
  incrementUsage,
  listCatalogTags,
  normalizeTags,
  searchItems,
  updateItem,
  itemToInput,
} from "@/lib/services/catalog";
import { frequentOmissions } from "@/lib/services/omissions";
import { freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "etiquettes@exemple.fr");
});

describe("étiquettes et prestations récentes", () => {
  it("nettoie les étiquettes, filtre par étiquette et les retrouve à la recherche", async () => {
    expect(normalizeTags(" Salle de Bain, extérieur ;salle de bain|  ")).toEqual(["salle de bain", "extérieur"]);
    const a = await createItem(ctx, { name: "Pose de faïence", unit: "m²", unit_price: "48", vat_percent: "10", tags: "Salle de bain, Rénovation" });
    await createItem(ctx, { name: "Pose de pavés", unit: "m²", unit_price: "60", vat_percent: "20", tags: ["extérieur"] });
    expect((await searchItems(ctx, { tag: "salle de bain" })).map((i) => i.id)).toEqual([a]);
    expect((await searchItems(ctx, { q: "renovation" })).map((i) => i.id)).toContain(a);
    expect(await listCatalogTags(ctx)).toEqual(
      expect.arrayContaining([
        { tag: "salle de bain", count: 1 },
        { tag: "extérieur", count: 1 },
      ]),
    );

    // Une modification sans le champ étiquettes les conserve.
    const { tags: _tags, ...rest } = itemToInput(await getItem(ctx, a));
    await updateItem(ctx, a, { ...rest, unit_price: "50" });
    expect((await getItem(ctx, a)).tags).toEqual(["salle de bain", "rénovation"]);
  });

  it("classe en tête les prestations utilisées récemment", async () => {
    const old = await createItem(ctx, { name: "Ancienne", unit: "u", unit_price: "1", vat_percent: "20" });
    const recent = await createItem(ctx, { name: "Récente", unit: "u", unit_price: "1", vat_percent: "20" });
    await incrementUsage(db, ctx.orgId, [old]);
    await db.query("UPDATE catalog_items SET last_used_at = now() - interval '2 days' WHERE id=$1", [old]);
    await incrementUsage(db, ctx.orgId, [recent]);
    const list = await searchItems(ctx, { sort: "used" });
    expect(list[0].id).toBe(recent);
    expect(list[1].id).toBe(old);
  });

  it("exporte et réimporte les étiquettes au format CSV", async () => {
    const csv = await catalogCsv(ctx);
    expect(csv.split("\n")[0]).toContain("tags");
    expect(csv).toContain("salle de bain|rénovation");
    const r = await importCatalogCsv(ctx, "name;unit;unit_price;vat_percent;tags\nPose de plinthes;ml;12;10;finitions|intérieur\n", false);
    expect(r.imported).toBe(1);
    expect((await searchItems(ctx, { tag: "finitions" }))[0].name).toBe("Pose de plinthes");
  });
});

describe("oublis fréquents", () => {
  const l = (label: string, nature = "main_oeuvre") => ({ kind: "item", nature, label });

  it("rappelle protection, gravats, nettoyage et déplacement sur un devis fourni", () => {
    const codes = frequentOmissions([l("Dépose de l'ancien carrelage"), l("Pose de carrelage au sol"), l("Fourniture de carrelage", "materiau")]).map(
      (o) => o.code,
    );
    expect(codes).toEqual(["protection", "gravats", "nettoyage", "deplacement"]);
  });

  it("se tait quand les lignes sont présentes ou que le devis est trop court", () => {
    expect(
      frequentOmissions([
        l("Dépose de l'ancien carrelage"),
        l("Protection des sols par bâche"),
        l("Évacuation des gravats en déchèterie"),
        l("Nettoyage de fin de chantier"),
        l("Déplacement", "deplacement"),
      ]),
    ).toEqual([]);
    expect(frequentOmissions([l("Dépose"), l("Pose")])).toEqual([]);
    expect(frequentOmissions([l("Pose de parquet"), l("Protection"), l("Nettoyage")], { travelFee: "35 euros" })).toEqual([]);
  });
});
