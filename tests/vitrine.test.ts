import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { stripImageMetadata } from "@/lib/image-metadata";
import type { Ctx } from "@/lib/services/context";
import { addJournalEntry } from "@/lib/services/job-site";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import {
  addShowcasePhoto,
  getShowcase,
  listShowcasePhotos,
  publicShowcase,
  publicShowcasePhoto,
  removeShowcasePhoto,
  requestFromShowcase,
  slugify,
  updateShowcase,
} from "@/lib/services/showcase";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let other: Ctx;

const seg = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));
/** JPEG minimal : en-tête JFIF, bloc EXIF avec une position GPS, puis les données d'image. */
const JPEG = new Uint8Array([
  0xff,
  0xd8,
  ...seg(0xe0, [...ascii("JFIF"), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
  ...seg(0xe1, [...ascii("Exif"), 0, 0, ...ascii("GPS 45.7578N 4.8320E")]),
  ...seg(0xfe, ascii("Appareil de Paul")),
  ...seg(0xda, [1, 1, 0, 0, 0x3f, 0]),
  0x12,
  0x34,
  0x56,
  0xff,
  0xd9,
]);

async function jobWithPhoto(c: Ctx) {
  const id = await createQuote(c, { customerId: await makeCustomer(c) });
  const d = await getDraft(c, id);
  await saveDraft(
    c,
    id,
    {
      ...d,
      title: "Salle de bains",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Solde à réception de facture.",
      sections: [{ ...d.sections[0], lines: [line()] }],
    },
    d.draftRevision,
  );
  await issueQuote(c, id);
  await recordResponseManually(c, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  const jobId = await createJobFromQuote(c, id);
  const entry = await addJournalEntry(c, jobId, { note: "Douche terminée", photo: JPEG });
  const rows = await db.query<{ id: string }>("SELECT id FROM job_journal WHERE job_id=$1", [jobId]);
  return { jobId, journalId: (entry as { id?: string })?.id ?? rows[0].id };
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "vitrine@exemple.fr");
  await completeProfile(ctx);
  other = await signUp(db, "autre-vitrine@exemple.fr", "Plomberie Durand");
});

describe("métadonnées des photos publiées", () => {
  it("retire EXIF et commentaires d'un JPEG sans toucher à l'image", () => {
    const out = stripImageMetadata(JPEG, "image/jpeg");
    const text = Buffer.from(out).toString("latin1");
    expect(text).not.toContain("GPS");
    expect(text).not.toContain("Appareil");
    expect(text).toContain("JFIF");
    expect([...out.slice(-5)]).toEqual([0x12, 0x34, 0x56, 0xff, 0xd9]);
  });

  it("refuse un fichier qui n'est pas une image", () => {
    expect(() => stripImageMetadata(new Uint8Array([1, 2, 3, 4, 5]), "image/jpeg")).toThrow();
  });
});

describe("page vitrine", () => {
  it("propose une adresse tirée du nom et refuse les adresses réservées ou prises", async () => {
    expect(slugify("Carrelage Martin & Fils, Lyon")).toBe("carrelage-martin-fils-lyon");
    expect((await getShowcase(ctx)).slug).toBe("carrelage-martin-lyon");
    await expect(updateShowcase(ctx, { enabled: "on", slug: "admin" })).rejects.toMatchObject({ status: 400 });
    await expect(updateShowcase(ctx, { enabled: "on", slug: "A" })).rejects.toMatchObject({ status: 400 });
    await updateShowcase(ctx, {
      enabled: "on",
      slug: "carrelage-martin-lyon",
      intro: "Carreleur à Lyon depuis 2008.",
      area: "Lyon et 30 km",
      show_phone: "on",
    });
    await expect(updateShowcase(other, { enabled: "", slug: "carrelage-martin-lyon" })).rejects.toMatchObject({ status: 409 });
    // Sans SIRET, la vitrine ne s'ouvre pas.
    await expect(updateShowcase(other, { enabled: "on", slug: "plomberie-durand" })).rejects.toMatchObject({ status: 400 });
  });

  it("affiche le profil, l'assurance et seulement les coordonnées choisies", async () => {
    const p = (await publicShowcase(db, "carrelage-martin-lyon"))!;
    expect(p).toMatchObject({ name: "Carrelage Martin", city: "Lyon", intro: "Carreleur à Lyon depuis 2008.", phone: "04 72 00 00 00", email: "" });
    expect(p.decennale?.insurer).toBe("Assurances Exemple");
    expect(await publicShowcase(db, "inconnue")).toBeNull();
  });

  it("publie une photo du journal avec l'accord du client, sans métadonnées ni nom du client", async () => {
    const { journalId } = await jobWithPhoto(ctx);
    await expect(addShowcasePhoto(ctx, journalId, { caption: "Douche à l'italienne", consent: "" })).rejects.toMatchObject({ status: 400 });
    await expect(addShowcasePhoto(other, journalId, { consent: "on" })).rejects.toMatchObject({ status: 404 });
    const id = await addShowcasePhoto(ctx, journalId, {
      caption: "Douche à l'italienne",
      consent: "on",
      showCity: "on",
      consentNote: "Accord oral à la réception",
    });
    await expect(addShowcasePhoto(ctx, journalId, { consent: "on" })).rejects.toMatchObject({ status: 409 });

    const p = (await publicShowcase(db, "carrelage-martin-lyon"))!;
    expect(p.photos).toEqual([{ id, caption: "Douche à l'italienne", city: "Lyon" }]);
    expect(JSON.stringify(p)).not.toContain("Dubois");
    const img = await publicShowcasePhoto(db, "carrelage-martin-lyon", id);
    expect(Buffer.from(img.bytes).toString("latin1")).not.toContain("GPS");

    expect((await listShowcasePhotos(ctx))[0].job_title).toBeTruthy();
    await removeShowcasePhoto(ctx, id);
    expect((await publicShowcase(db, "carrelage-martin-lyon"))!.photos).toEqual([]);
  });

  it("transmet une demande de devis à l'entreprise et ignore les robots", async () => {
    const meta = { ip: "203.0.113.9" };
    await expect(
      requestFromShowcase(db, "carrelage-martin-lyon", { name: "Lucie", description: "Refaire la salle de bains", consent: "on" }, meta),
    ).rejects.toMatchObject({
      status: 400,
    });
    await requestFromShowcase(
      db,
      "carrelage-martin-lyon",
      { name: "Lucie Bernard", phone: "06 12 34 56 78", city: "Villeurbanne", description: "Refaire la salle de bains de 5 m²", consent: "on" },
      meta,
    );
    await requestFromShowcase(
      db,
      "carrelage-martin-lyon",
      { name: "Robot", phone: "0600000000", description: "Achetez nos produits", consent: "on", website: "http://spam" },
      meta,
    );
    const leads = await db.query<{ name: string; source: string }>("SELECT name, source FROM leads WHERE org_id=$1", [ctx.orgId]);
    expect(leads).toEqual([{ name: "Lucie Bernard", source: "site" }]);
    const mails = await db.query<{ subject: string }>("SELECT subject FROM emails WHERE org_id=$1 AND subject LIKE 'Nouvelle demande%'", [ctx.orgId]);
    expect(mails).toHaveLength(1);

    await updateShowcase(ctx, { enabled: "", slug: "carrelage-martin-lyon" });
    expect(await publicShowcase(db, "carrelage-martin-lyon")).toBeNull();
    await expect(
      requestFromShowcase(db, "carrelage-martin-lyon", { name: "Lucie", phone: "06", description: "Une autre demande", consent: "on" }, meta),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
