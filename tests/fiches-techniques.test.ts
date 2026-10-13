import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { createItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { addCatalogDocument, catalogDocumentFile, listCatalogDocuments, mergedDocuments, removeCatalogDocument } from "@/lib/services/datasheets";
import { createQuote, getDraft, getVersion, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let laine: string;

async function pdf(pages: number, text: string) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage().drawText(`${text} ${i + 1}`, { x: 50, y: 700 });
  return d.save();
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "fiches@exemple.fr");
  await completeProfile(ctx);
  laine = await createItem(ctx, { name: "Laine de verre 200 mm", category: "materiau", vat_percent: "5.5", unit: "m²", unit_price: "18" });
});

describe("fiches techniques et certificats", () => {
  it("accepte seulement des PDF lisibles et les garde intacts", async () => {
    await expect(addCatalogDocument(ctx, laine, { kind: "fiche_technique", title: "FT" }, new TextEncoder().encode("bonjour"))).rejects.toMatchObject(
      {
        status: 400,
      },
    );
    await expect(addCatalogDocument(ctx, laine, { kind: "inconnu", title: "FT" }, await pdf(1, "x"))).rejects.toMatchObject({ status: 400 });
    const bytes = await pdf(2, "Fiche technique");
    const id = await addCatalogDocument(ctx, laine, { kind: "fiche_technique", title: "Fiche technique IBR 200" }, bytes);
    await addCatalogDocument(ctx, laine, { kind: "certificat", title: "Certificat ACERMI" }, await pdf(1, "ACERMI"));
    expect((await catalogDocumentFile(ctx, id)).bytes).toEqual(bytes);
    expect((await listCatalogDocuments(ctx, laine)).map((d) => d.title)).toEqual(["Fiche technique IBR 200", "Certificat ACERMI"]);
  });

  it("joint les documents des articles du devis et les réunit pour le client", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Isolation des combles",
        sections: [{ ...d.sections[0], lines: [line({ catalogItemId: laine, label: "Laine de verre 200 mm" }), line()] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(v.snapshot.documents?.map((x) => [x.title, x.item])).toEqual([
      ["Fiche technique IBR 200", "Laine de verre 200 mm"],
      ["Certificat ACERMI", "Laine de verre 200 mm"],
    ]);
    expect(v.snapshot.mentions.join("\n")).toContain("certificat ou avis technique « Certificat ACERMI »");

    // Un document retiré du catalogue reste disponible pour le devis déjà émis.
    const [first] = await listCatalogDocuments(ctx, laine);
    await removeCatalogDocument(ctx, first.id);
    expect(await listCatalogDocuments(ctx, laine)).toHaveLength(1);
    const merged = await PDFDocument.load(await mergedDocuments(db, ctx.orgId, v.number, v.snapshot.documents!));
    // Sommaire + 2 pages de fiche + 1 page de certificat.
    expect(merged.getPageCount()).toBe(4);
    await expect(mergedDocuments(db, ctx.orgId, v.number, [])).rejects.toMatchObject({ status: 404 });
    const other = await signUp(db, "autre-fiches@exemple.fr", "Autre");
    await expect(catalogDocumentFile(other, first.id)).rejects.toMatchObject({ status: 404 });
  });
});
