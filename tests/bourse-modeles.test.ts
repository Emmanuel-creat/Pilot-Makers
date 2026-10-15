import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, saveDraft } from "@/lib/services/quotes";
import { acquireListing, marketListings, marketTrades, myMarket, publishTemplate, settlePurchase, withdrawListing } from "@/lib/services/template-market";
import { createQuoteFromTemplate, listTemplates, saveQuoteAsTemplate } from "@/lib/services/templates";
import { freeName, parsePrice, preview, sellableData } from "@/lib/template-market";
import { freshDb, line, makeCustomer, signUp } from "./helpers";

describe("règles de la bourse", () => {
  it("lit le prix, retire les données internes et nomme sans doublon", () => {
    expect(parsePrice("")).toBe(0);
    expect(parsePrice("29,90 €")).toBe(2990);
    expect(() => parsePrice("600")).toThrow(/500 euros/);
    expect(() => parsePrice("abc")).toThrow(/invalide/);
    const data = {
      title: "x",
      sections: [{ title: "Sol", lines: [{ kind: "item", label: "Pose", unitCost: "20", internalNote: "marge", catalogItemId: "c1", measure: { a: 1 } }] }],
    };
    const clean = sellableData(data).sections[0].lines[0];
    expect(clean).toMatchObject({ label: "Pose", unitCost: "", internalNote: "", catalogItemId: null });
    expect("measure" in clean).toBe(false);
    expect(
      preview({
        sections: [
          {
            title: "",
            lines: [
              { kind: "note", label: "Note" },
              { kind: "item", label: "Pose" },
            ],
          },
        ],
      }),
    ).toEqual([{ title: "Sans titre", lines: 1, sample: ["Pose"] }]);
    expect(freeName("Salle de bain", ["salle de bain", "Salle de bain (2)"])).toBe("Salle de bain (3)");
  });
});

describe("bourse aux modèles", () => {
  let db: Database;
  let seller: Ctx;
  let buyer: Ctx;
  let templateId: string;
  let listingId: string;

  beforeAll(async () => {
    db = await freshDb();
    seller = await signUp(db, "vendeur@bourse.fr", "Carrelage Martin");
    buyer = await signUp(db, "acheteur@bourse.fr", "Carrelage Roy");
    const q = await createQuote(seller, { customerId: await makeCustomer(seller) });
    const d = await getDraft(seller, q);
    await saveDraft(
      seller,
      q,
      {
        ...d,
        title: "Salle de bain",
        sections: [
          {
            id: d.sections[0].id,
            title: "Sol",
            description: "",
            lines: [line({ unitCost: "18", internalNote: "fournisseur habituel" }), line({ label: "Plinthes" })],
          },
        ],
      },
      d.draftRevision,
    );
    templateId = await saveQuoteAsTemplate(seller, q, { name: "Salle de bain type" });
  });

  it("réserve la vente aux entreprises expérimentées, mais laisse céder gratuitement", async () => {
    await expect(publishTemplate(seller, templateId, { title: "Salle de bain complète", price: "39" })).rejects.toMatchObject({ status: 403 });
    listingId = await publishTemplate(seller, templateId, { title: "Salle de bain complète", summary: "Dépose, sol, faïence." });
    const [l] = await marketListings(buyer);
    expect(l).toMatchObject({ title: "Salle de bain complète", priceCents: 0, seller: "Carrelage Martin", lineCount: 2, mine: null });
    expect(l.preview[0]).toEqual({ title: "Sol", lines: 2, sample: ["Pose de carrelage", "Plinthes"] });
    expect(await marketListings(seller)).toEqual([]);
    expect(await marketTrades(buyer)).toEqual(["carrelage"]);
  });

  it("ajoute un modèle gratuit aux modèles de l'acheteur, sans les données internes du vendeur", async () => {
    const r = await acquireListing(buyer, listingId);
    expect(r.status).toBe("regle");
    const mine = await listTemplates(buyer);
    expect(mine.map((t) => t.name)).toEqual(["Salle de bain complète"]);
    const quote = await createQuoteFromTemplate(buyer, r.templateId!);
    const lines = (await getDraft(buyer, quote)).sections[0].lines;
    expect(lines.map((x) => [x.label, x.unitCost, x.internalNote])).toEqual([
      ["Pose de carrelage", "", ""],
      ["Plinthes", "", ""],
    ]);
    await expect(acquireListing(buyer, listingId)).rejects.toMatchObject({ status: 409 });
    await expect(acquireListing(seller, listingId)).rejects.toThrow(/déjà le vôtre/);
  });

  it("vend un modèle : demande, règlement confirmé par le vendeur, puis livraison", async () => {
    await db.query("UPDATE quotes SET status='accepted' WHERE org_id=$1", [seller.orgId]);
    for (let i = 0; i < 10; i++) {
      const q = await createQuote(seller, { customerId: null });
      await db.query("UPDATE quotes SET status='accepted' WHERE id=$1", [q]);
    }
    const other = await signUp(db, "client@bourse.fr", "Plomberie Durand");
    await publishTemplate(seller, templateId, { title: "Salle de bain complète", price: "39,00" });
    const r = await acquireListing(other, listingId);
    expect(r).toEqual({ status: "a_regler", templateId: null });
    expect(await listTemplates(other)).toEqual([]);
    const m = await myMarket(seller);
    expect(m.canSell).toBe(true);
    expect(m.pending.map((p) => [p.buyer, p.price_cents])).toEqual([["Plomberie Durand", 3900]]);
    const mails = await db.query("SELECT 1 FROM emails WHERE kind='notification' AND subject LIKE 'Demande d''achat%'");
    expect(mails).toHaveLength(1);
    await expect(settlePurchase(buyer, m.pending[0].id)).rejects.toMatchObject({ status: 404 });
    await settlePurchase(seller, m.pending[0].id);
    expect((await listTemplates(other)).map((t) => t.name)).toEqual(["Salle de bain complète"]);
    expect((await myMarket(seller)).earnedCents).toBe(3900);
    expect((await marketListings(other))[0].mine).toBe("regle");
  });

  it("retire le modèle de la bourse", async () => {
    await withdrawListing(seller, listingId);
    expect(await marketListings(buyer)).toEqual([]);
    await expect(acquireListing(await signUp(db, "tard@bourse.fr", "Peinture Lenoir"), listingId)).rejects.toMatchObject({ status: 404 });
  });
});
