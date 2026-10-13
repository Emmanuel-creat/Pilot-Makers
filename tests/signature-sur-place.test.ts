import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { decodeSignature, onsiteSignature, signOnSite } from "@/lib/services/onsite-signature";
import { acceptedCopy, createQuote, getDraft, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, meta, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

function crc32(buf: Buffer) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** Petite image PNG en niveaux de gris, avec un trait irrégulier, comme une signature. */
function signaturePng(w = 120, h = 40) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const raw = Buffer.alloc((w + 1) * h, 255);
  for (let x = 0; x < w; x++) {
    const y = Math.round(h / 2 + Math.sin(x / 7) * (h / 3));
    raw[y * (w + 1) + 1 + x] = (x * 37) % 120;
    raw[y * (w + 1)] = 0;
  }
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 0 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function issued() {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Carrelage cuisine",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Solde à réception de facture.",
      sections: [{ ...d.sections[0], lines: [line()] }],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  return id;
}

const valid = () => ({ version: 1, name: "Claire Dubois", consent: true, vatAttestation: true, signature: signaturePng() });

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "signature@exemple.fr");
  await completeProfile(ctx);
});

describe("signature du client sur l'écran de l'artisan", () => {
  it("refuse une image qui n'est pas une signature PNG", () => {
    expect(() => decodeSignature("data:image/jpeg;base64,AAAA")).toThrow();
    expect(() => decodeSignature(`data:image/png;base64,${Buffer.alloc(200, 1).toString("base64")}`)).toThrow();
    expect(decodeSignature(signaturePng()).length).toBeGreaterThan(100);
  });

  it("exige l'accord, le nom et l'attestation de TVA réduite", async () => {
    const id = await issued();
    await expect(signOnSite(ctx, id, { ...valid(), consent: false }, meta)).rejects.toMatchObject({ status: 400 });
    await expect(signOnSite(ctx, id, { ...valid(), name: "" }, meta)).rejects.toMatchObject({ status: 400 });
    await expect(signOnSite(ctx, id, { ...valid(), vatAttestation: false }, meta)).rejects.toMatchObject({ status: 400 });
    await expect(signOnSite(ctx, id, { ...valid(), signature: "" }, meta)).rejects.toMatchObject({ status: 400 });
    await expect(signOnSite(ctx, id, { ...valid(), version: 2 }, meta)).rejects.toMatchObject({ status: 409 });
    expect((await getDraft(ctx, id)).status).not.toBe("accepted");
  });

  it("accepte le devis, conserve la signature et envoie l'exemplaire au client", async () => {
    const id = await issued();
    const r = await signOnSite(ctx, id, { ...valid(), earlyStart: true }, meta);
    expect(r.emailed).toBe(true);
    expect((await getDraft(ctx, id)).status).toBe("accepted");

    const sig = await onsiteSignature(db, ctx.orgId, id, 1);
    expect(sig?.name).toBe("Claire Dubois");
    const ev = await db.query<{ data: Record<string, unknown> }>("SELECT data FROM document_events WHERE quote_id=$1 AND type='accepted'", [id]);
    expect(ev[0].data.via).toBe("signature sur place");
    expect(ev[0].data.signature_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(ev[0].data.early_start_requested).toBe(true);
    const mails = await db.query<{ kind: string; body: string }>("SELECT kind, body FROM emails WHERE quote_id=$1 AND kind='quote_signed'", [id]);
    expect(mails).toHaveLength(1);
    expect(mails[0].body).toContain("/d/");

    const copy = await acceptedCopy(db, ctx.orgId, id);
    const pdf = await PDFDocument.load(copy.pdf);
    expect(pdf.getPageCount()).toBeGreaterThan(0);

    await expect(signOnSite(ctx, id, valid(), meta)).rejects.toMatchObject({ status: 409 });
  });

  it("n'envoie rien quand le client n'a pas d'adresse e-mail", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx, { email: "" }) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Faïence",
        site: { line1: "1 rue Neuve", line2: "", postalCode: "69001", city: "Lyon" },
        paymentTerms: "Comptant.",
        sections: [{ ...d.sections[0], lines: [line()] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    expect((await signOnSite(ctx, id, valid(), meta)).emailed).toBe(false);
  });
});
