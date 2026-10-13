import { inflateSync } from "node:zlib";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { getOrganization, updateOrganization } from "@/lib/services/organization";
import { appearancePreviewPdf, createQuote, getDraft, getVersion, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

/** Polices et textes d'un PDF : noms des polices embarquées et chaînes dessinées (pdf-lib les écrit en hexadécimal). */
async function inspect(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  const fonts = new Set<string>();
  let text = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFDict && obj.get(PDFName.of("Type")) === PDFName.of("Font")) {
      fonts.add(String(obj.get(PDFName.of("BaseFont"))).replace("/", ""));
    }
    if (obj instanceof PDFRawStream && !obj.dict.get(PDFName.of("Type"))) {
      let raw: Buffer;
      try {
        raw = inflateSync(Buffer.from(obj.contents));
      } catch {
        continue;
      }
      for (const m of raw.toString("latin1").matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) text += Buffer.from(m[1], "hex").toString("latin1") + "\n";
    }
  }
  return { fonts: [...fonts].sort(), text };
}

async function quoteWithLines() {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  await saveDraft(ctx, id, { ...d, title: "Salle de bains", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "apparence@exemple.fr");
  await completeProfile(ctx);
});

describe("personnalisation du PDF", () => {
  it("demande un premier devis avant de montrer l'aperçu du modèle", async () => {
    await expect(appearancePreviewPdf(ctx)).rejects.toMatchObject({ status: 404 });
  });

  it("garde Helvetica et aucune mention par défaut", async () => {
    const id = await quoteWithLines();
    await issueQuote(ctx, id);
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(v.snapshot.font).toBeUndefined();
    expect(v.snapshot.footerNote).toBeUndefined();
    const { fonts } = await inspect(v.pdf);
    expect(fonts).toContain("Helvetica");
    expect(fonts.some((f) => f.startsWith("Times"))).toBe(false);
  });

  it("imprime la police, la mention et la mise en page choisies", async () => {
    await updateOrganization(ctx, { pdf_font: "times", default_pdf_layout: "synthese", pdf_footer_note: "Artisan certifié RGE Qualibat" });
    const org = await getOrganization(ctx);
    expect(org).toMatchObject({ pdf_font: "times", default_pdf_layout: "synthese", pdf_footer_note: "Artisan certifié RGE Qualibat" });
    await expect(updateOrganization(ctx, { pdf_font: "comic" })).rejects.toMatchObject({ status: 400 });

    const id = await quoteWithLines();
    expect((await getDraft(ctx, id)).layout).toBe("synthese");
    await issueQuote(ctx, id);
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(v.snapshot).toMatchObject({ font: "times", footerNote: "Artisan certifié RGE Qualibat" });
    const { fonts, text } = await inspect(v.pdf);
    expect(fonts).toEqual(expect.arrayContaining(["Times-Roman", "Times-Bold"]));
    expect(fonts).not.toContain("Helvetica");
    expect(text).toContain("Artisan certifié RGE Qualibat");

    const preview = await inspect(await appearancePreviewPdf(ctx));
    expect(preview.text).toContain("Artisan certifié RGE Qualibat");
  });
});
