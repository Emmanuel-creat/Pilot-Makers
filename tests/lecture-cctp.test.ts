import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { docxParagraphs, normalizeUnit, odtParagraphs, pdfContentText, readSpec, specParagraphs, textParagraphs } from "@/lib/spec-reader";
import { zip } from "@/lib/zip";
import { createItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { getDraft } from "@/lib/services/quotes";
import { importSpec } from "@/lib/services/spec-import";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

const CCTP = [
  "CAHIER DES CLAUSES TECHNIQUES PARTICULIÈRES",
  "1 Généralités",
  "Les travaux seront exécutés selon le NF DTU 52.2 P1-1-1 et le DTU 26.2.",
  "LOT 03 - CARRELAGE ET FAÏENCE",
  "3.1 Prescriptions communes",
  "Les produits bénéficieront d'un classement UPEC adapté.",
  "3.2 Chape de ravoirage",
  "Chape ciment de 5 cm d'épaisseur, conforme au DTU 26.2.",
  "Localisation : salle de bains et cuisine",
  "Quantité : 32,50 m²",
  "3.3 Carrelage sol grès cérame 60x60",
  "Pose collée sur chape. Surface estimée 28 m2, hauteur sous plafond 2,50 m.",
  "3.4 Plinthes assorties",
  "Plinthes droites, 42 ml.",
  "LOT 04 : PEINTURE",
  "4.1 Travaux préparatoires",
  "4.1.1 Lessivage des murs",
  "Lessivage complet. Localisation : toutes pièces",
  "4.1.2 Rebouchage",
  "Rebouchage des fissures et trous.",
];

describe("lecture d'un CCTP", () => {
  it("repère lots, articles, quantités, localisations et références", () => {
    const r = readSpec(textParagraphs(CCTP.join("\n")));
    expect(r.lots.map((l) => [l.ref, l.title])).toEqual([
      ["03", "CARRELAGE ET FAÏENCE"],
      ["04", "PEINTURE"],
    ]);
    expect(r.lots[0].articles.map((a) => [a.ref, a.title, a.quantity, a.unit])).toEqual([
      ["3.2", "Chape de ravoirage", "32,50", "m²"],
      ["3.3", "Carrelage sol grès cérame 60x60", "28", "m²"],
      ["3.4", "Plinthes assorties", "42", "ml"],
    ]);
    expect(r.lots[0].articles[0].description).toBe("Localisation : salle de bains et cuisine");
    // 4.1 a des sous-articles : seul le détail est gardé ; sans quantité, une ligne d'ensemble.
    expect(r.lots[1].articles.map((a) => [a.ref, a.quantity, a.unit])).toEqual([
      ["4.1.1", "1", "ens"],
      ["4.1.2", "1", "ens"],
    ]);
    expect(r.references).toEqual(["NF DTU 52.2 P1-1-1", "DTU 26.2"]);
  });

  it("document sans lot : un titre de premier niveau ouvre un lot, sinon un lot Travaux", () => {
    const r = readSpec(textParagraphs("2 MENUISERIES\n2.1 Porte d'entrée\nFourniture et pose de 1 u."));
    expect(r.lots).toEqual([
      {
        ref: "2",
        title: "MENUISERIES",
        articles: [{ ref: "2.1", title: "Porte d'entrée", description: "Fourniture et pose de 1 u.", quantity: "1", unit: "u" }],
      },
    ]);
    expect(readSpec(textParagraphs("1.1 Dépose\nDépose soignée.")).lots[0].title).toBe("Travaux");
  });

  it("unités normalisées", () => {
    expect(["m2", "M²", "m3", "ML", "mètres linéaires", "forfait", "Ft", "U", "pièces"].map(normalizeUnit)).toEqual([
      "m²",
      "m²",
      "m³",
      "ml",
      "ml",
      "ens",
      "ens",
      "u",
      "u",
    ]);
  });

  it("lit les paragraphes d'un Word et d'un OpenDocument avec les niveaux de titre", () => {
    const docx = `<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Titre1"/></w:pPr><w:r><w:t>LOT 01</w:t></w:r><w:r><w:t xml:space="preserve"> GROS &amp; ŒUVRE</w:t></w:r></w:p><w:p><w:r><w:t>Texte</w:t></w:r></w:p><w:p></w:p></w:body></w:document>`;
    expect(docxParagraphs(docx)).toEqual([
      { text: "LOT 01 GROS & ŒUVRE", heading: 1 },
      { text: "Texte", heading: 0 },
    ]);
    const odt = `<office:text><text:h text:outline-level="2">3.2 Chape</text:h><text:p>Quantité<text:s/>: 10 m²</text:p></office:text>`;
    expect(odtParagraphs(odt)).toEqual([
      { text: "3.2 Chape", heading: 2 },
      { text: "Quantité : 10 m²", heading: 0 },
    ]);
  });

  it("extrait le texte d'un flux PDF : chaînes, tableaux, codes octaux et hexadécimaux", () => {
    expect(pdfContentText("BT /F1 12 Tf 72 700 Td (3.2 Chape) Tj 0 -14 Td [(Quan) -10 (tit\\351) -400 (: 5 m2)] TJ <414243> Tj ET")).toBe(
      "\n3.2 Chape\nQuantité : 5 m2ABC\n",
    );
  });

  it("lit un .docx, un PDF non scanné, et refuse un PDF sans texte ou un format inconnu", async () => {
    const xml = `<w:document><w:body>${CCTP.map((t) => `<w:p><w:r><w:t>${t.replace(/&/g, "&amp;")}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;
    const docx = zip([{ name: "word/document.xml", data: xml }]);
    expect(readSpec(await specParagraphs(new Uint8Array(docx), "cctp.docx")).lots).toHaveLength(2);

    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage([595, 842]);
    CCTP.forEach((t, k) => page.drawText(t.replace(/Œ/g, "OE"), { x: 40, y: 800 - k * 16, size: 10, font }));
    const fromPdf = readSpec(await specParagraphs(await pdf.save(), "cctp.pdf"));
    expect(fromPdf.lots.map((l) => l.ref)).toEqual(["03", "04"]);
    expect(fromPdf.lots[0].articles[0].quantity).toBe("32,50");

    const blank = await PDFDocument.create();
    blank.addPage();
    await expect(specParagraphs(await blank.save(), "scan.pdf")).rejects.toThrow(/pas de texte lisible/);
    await expect(specParagraphs(new Uint8Array([1, 2, 3]), "plan.dwg")).rejects.toThrow(/Format non pris en charge/);
    await expect(specParagraphs(new Uint8Array([1, 2, 3]), "abime.docx")).rejects.toThrow(/illisible/);
  });
});

describe("devis préparé depuis un CCTP", () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await signUp(await freshDb(), "cctp@exemple.fr");
    await completeProfile(ctx);
    await createItem(ctx, { name: "Chape de ravoirage ciment", category: "main_oeuvre", vat_percent: "10", unit: "m²", unit_price: "24" });
  });

  it("crée lots et lignes, reprend le prix du catalogue et signale ce qui reste à compléter", async () => {
    const customerId = await makeCustomer(ctx);
    const r = await importSpec(ctx, { bytes: new TextEncoder().encode(CCTP.join("\n")), fileName: "CCTP école.txt", customerId });
    expect(r).toMatchObject({ lots: 2, articles: 5, matched: 1, withQuantity: 3, references: ["NF DTU 52.2 P1-1-1", "DTU 26.2"] });
    const d = await getDraft(ctx, r.quoteId);
    expect(d.title).toBe("CCTP école");
    expect(d.customerId).toBe(customerId);
    expect(d.sections.map((s) => s.title)).toEqual(["Lot 03 CARRELAGE ET FAÏENCE", "Lot 04 PEINTURE"]);
    const [note, chape, carrelage] = d.sections[0].lines;
    expect(note.kind).toBe("note");
    expect(note.label).toContain("NF DTU 52.2 P1-1-1, DTU 26.2");
    expect(chape).toMatchObject({ label: "3.2 Chape de ravoirage", quantity: "32,50", unit: "m²", estimated: false });
    expect(chape.unitPrice).toMatch(/^24/);
    expect(carrelage.estimated).toBe(true);
    expect(carrelage.estimateNote).toContain("Prix à compléter");
    expect(d.sections[1].lines[0].estimateNote).toContain("Quantité non indiquée");
  });

  it("refuse un document sans article numéroté", async () => {
    await expect(importSpec(ctx, { bytes: new TextEncoder().encode("Un texte sans articles."), fileName: "note.txt" })).rejects.toThrow(/Aucun article/);
  });
});
