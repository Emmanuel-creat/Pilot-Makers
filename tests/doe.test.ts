import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { doeChecks, quantityText, worksBySection, type DoeData } from "@/lib/doe";
import { createItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { addCatalogDocument } from "@/lib/services/datasheets";
import { doeData, doePdf, doeStatus, saveDoeNotes } from "@/lib/services/doe";
import { addJournalEntry, getReception, liftReserve, signReception } from "@/lib/services/job-site";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const PNG = `data:image/png;base64,${PNG_B64}`;

async function pdf(pages: number, text: string) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage().drawText(`${text} ${i + 1}`, { x: 50, y: 700 });
  return d.save();
}

describe("contenu du dossier", () => {
  const base: DoeData = {
    job: { title: "Salle de bains", address: "2 rue du Port, 13002 Marseille", startDate: null, endDate: null, quoteNumber: "D-2026-0001" },
    org: { name: "Martin", address: "", siret: "", phone: "", email: "", insurer: "", policy: "", area: "", decennale: false },
    customer: { name: "Claire Dubois", address: "" },
    works: [
      { section: "Démolition", label: "Dépose faïence", quantity: 12, unit: "m²" },
      { section: "Démolition", label: "Évacuation", quantity: 0, unit: "" },
      { section: "Pose", label: "Faïence", quantity: 12.5, unit: "m²" },
    ],
    documents: [],
    reception: null,
    reserves: [],
    photos: 0,
    notes: "",
  };

  it("regroupe les ouvrages par partie et écrit les quantités", () => {
    expect(worksBySection(base.works).map((g) => [g.section, g.works.length])).toEqual([
      ["Démolition", 2],
      ["Pose", 1],
    ]);
    expect(quantityText(base.works[2])).toBe("12,5 m²");
    expect(quantityText(base.works[1])).toBe("");
  });

  it("signale ce qui manque avant de remettre le dossier", () => {
    expect(
      doeChecks(base)
        .filter((c) => !c.ok)
        .map((c) => c.key),
    ).toEqual(["reception", "documents", "photos", "notes", "assurance"]);
    const full = doeChecks({
      ...base,
      reception: { date: "2026-10-01", decision: "avec_reserves" },
      reserves: [{ label: "Joint", location: "", liftedAt: null }],
      documents: [{ kind: "Fiche technique", title: "FT", item: "Colle" }],
      photos: 2,
      notes: "Nettoyer les joints au savon neutre.",
      org: { ...base.org, decennale: true, insurer: "Assurances du Bâtiment" },
    });
    expect(full.filter((c) => !c.ok).map((c) => [c.key, c.hint])).toEqual([["reserves", "1 réserve encore à lever."]]);
  });
});

describe("dossier d'un chantier", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "doe@exemple.fr");
    await completeProfile(ctx);
    const colle = await createItem(ctx, { name: "Colle carrelage C2", category: "materiau", vat_percent: "10", unit: "sac", unit_price: "25" });
    await addCatalogDocument(ctx, colle, { kind: "fiche_technique", title: "Fiche technique colle C2" }, await pdf(2, "Fiche"));
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Salle de bains",
        site: { line1: "2 rue du Port", line2: "", postalCode: "13002", city: "Marseille" },
        sections: [
          { ...d.sections[0], title: "Carrelage", lines: [line({ label: "Pose de faïence" }), line({ catalogItemId: colle, label: "Colle carrelage C2" })] },
        ],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    jobId = await createJobFromQuote(ctx, id);
  });

  it("réunit les ouvrages et les documents du devis accepté", async () => {
    const d = await doeData(ctx, jobId);
    expect(d.job).toMatchObject({ title: "Salle de bains", address: "2 rue du Port, 13002 Marseille" });
    expect(d.works.map((w) => [w.section, w.label])).toEqual([
      ["Carrelage", "Pose de faïence"],
      ["Carrelage", "Colle carrelage C2"],
    ]);
    expect(d.documents).toEqual([{ kind: "Fiche technique", title: "Fiche technique colle C2", item: "Colle carrelage C2" }]);
    expect((await doeStatus(ctx, jobId)).checks.find((c) => c.key === "reception")!.ok).toBe(false);
  });

  it("produit un dossier provisoire avant la réception", async () => {
    const doc = await PDFDocument.load(await doePdf(ctx, jobId, new Date("2026-10-13T10:00:00Z")));
    // Garde et sommaire, ouvrages à réception, photos, puis les 2 pages de la fiche technique.
    expect(doc.getPageCount()).toBe(5);
    expect(doc.getTitle()).toBe("Dossier des ouvrages exécutés : Salle de bains");
  });

  it("ajoute photos, conseils, procès-verbaux de réception et de levée", async () => {
    await addJournalEntry(ctx, jobId, { note: "Réseaux avant fermeture", photo: Buffer.from(PNG_B64, "base64"), takenAt: "2026-10-02T09:00:00Z" });
    await expect(saveDoeNotes(ctx, jobId, "x".repeat(4001))).rejects.toMatchObject({ status: 400 });
    await saveDoeNotes(ctx, jobId, "Nettoyer les joints au savon neutre, sans produit acide.");
    await signReception(ctx, jobId, {
      date: "2026-10-05",
      clientName: "Claire Dubois",
      clientSignature: PNG,
      companyName: "Paul Martin",
      companySignature: PNG,
      decision: "avec_reserves",
      reserves: [{ label: "Joint de silicone à reprendre", location: "Douche", dueDate: "" }],
    });
    const { reserves } = await getReception(ctx, jobId);
    await liftReserve(ctx, reserves[0].id, "Joint refait");
    const status = await doeStatus(ctx, jobId);
    expect(status.notes).toContain("savon neutre");
    expect(status.checks.every((c) => c.ok)).toBe(true);
    const doc = await PDFDocument.load(await doePdf(ctx, jobId, new Date("2026-10-13T10:00:00Z")));
    // 5 pages précédentes + procès-verbal de réception + procès-verbal de levée.
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(7);
    const other = await signUp(db, "doe-autre@exemple.fr", "Autre");
    await expect(doePdf(other, jobId)).rejects.toMatchObject({ status: 404 });
    await expect(saveDoeNotes(other, jobId, "Conseils")).rejects.toMatchObject({ status: 404 });
  });
});
