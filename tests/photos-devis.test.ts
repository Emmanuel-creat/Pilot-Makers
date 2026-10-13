import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import {
  addQuoteMedia,
  listQuoteMedia,
  MEDIA_MAX_PER_QUOTE,
  quoteMediaFile,
  removeQuoteMedia,
  sniffImage,
  updateQuoteMedia,
} from "@/lib/services/quote-media";
import { createQuote, getDraft, getVersion, issueQuote, previewPdf, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";
import { grayPng } from "./png";

let db: Database;
let ctx: Ctx;
let quoteId: string;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "photos-devis@exemple.fr");
  await completeProfile(ctx);
  quoteId = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, quoteId);
  await saveDraft(ctx, quoteId, { ...d, title: "Ravalement", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
});

const pages = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();

describe("photos et croquis du devis", () => {
  it("contrôle le format, retire les métadonnées et garde l'ordre", async () => {
    expect(sniffImage(new Uint8Array([0x25, 0x50, 0x44, 0x46]))).toBeNull();
    await expect(addQuoteMedia(ctx, quoteId, { kind: "photo" }, new Uint8Array([0x25, 0x50, 0x44, 0x46, 1, 2, 3, 4, 5]))).rejects.toMatchObject({
      status: 400,
    });
    await expect(addQuoteMedia(ctx, quoteId, { kind: "video" }, grayPng())).rejects.toMatchObject({ status: 400 });
    const a = await addQuoteMedia(ctx, quoteId, { kind: "photo", caption: "Mur nord, fissure" }, grayPng(64, 40, "GPS 45.76 4.83"));
    const b = await addQuoteMedia(ctx, quoteId, { kind: "croquis", caption: "Cotes de la façade" }, grayPng(80, 50));
    const file = await quoteMediaFile(ctx, a);
    expect(file.type).toBe("image/png");
    expect(Buffer.from(file.bytes).toString("latin1")).not.toContain("GPS 45.76");
    await updateQuoteMedia(ctx, b, { move: "up" });
    await updateQuoteMedia(ctx, a, { caption: "Mur nord : fissure à reprendre" });
    expect((await listQuoteMedia(ctx, quoteId)).map((m) => [m.kind, m.caption])).toEqual([
      ["croquis", "Cotes de la façade"],
      ["photo", "Mur nord : fissure à reprendre"],
    ]);
    const other = await signUp(db, "autre-photos@exemple.fr", "Autre");
    await expect(quoteMediaFile(other, a)).rejects.toMatchObject({ status: 404 });
  });

  it("imprime les images dans le PDF et les fige à l'émission", async () => {
    const before = await previewPdf(ctx, quoteId);
    expect(await pages(before)).toBeGreaterThanOrEqual(1);
    await issueQuote(ctx, quoteId);
    const v = await getVersion(db, ctx.orgId, quoteId, 1);
    expect(v.snapshot.media?.map((m) => m.caption)).toEqual(["Cotes de la façade", "Mur nord : fissure à reprendre"]);
    expect(v.snapshot.media?.[0].dataUrl).toMatch(/^data:image\/png;base64,/);
    const doc = await PDFDocument.load(v.pdf);
    const xobjects = doc.context
      .enumerateIndirectObjects()
      .filter(([, o]) => String((o as { dict?: { get: (k: unknown) => unknown } }).dict?.get?.(doc.context.obj("Subtype")) ?? "") === "/Image");
    expect(xobjects.length).toBeGreaterThanOrEqual(2);
    const [m] = await listQuoteMedia(ctx, quoteId);
    await expect(removeQuoteMedia(ctx, m.id)).rejects.toMatchObject({ status: 409 });
  });

  it("limite le nombre d'images par devis", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    for (let i = 0; i < MEDIA_MAX_PER_QUOTE; i++) await addQuoteMedia(ctx, id, { kind: "croquis" }, grayPng(8, 8));
    await expect(addQuoteMedia(ctx, id, { kind: "croquis" }, grayPng(8, 8))).rejects.toMatchObject({ status: 400 });
    const [first] = await listQuoteMedia(ctx, id);
    await removeQuoteMedia(ctx, first.id);
    expect(await listQuoteMedia(ctx, id)).toHaveLength(MEDIA_MAX_PER_QUOTE - 1);
  });
});
