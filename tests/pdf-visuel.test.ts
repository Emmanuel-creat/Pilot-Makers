import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { renderQuotePdf } from "@/lib/pdf/quote-pdf";
import type { QuoteSnapshot } from "@/lib/services/quote-types";
import { sha256 } from "@/lib/security";
import { referenceSnapshot } from "./pdf-fixture";

/**
 * Contrôle visuel des PDF : le devis de référence est rendu dans chaque variante et
 * l'empreinte du fichier est comparée à celle enregistrée. Toute modification du rendu,
 * même d'un pixel de texte, fait échouer le test : on vérifie alors les aperçus
 * (`npm run pdf:apercus`) puis on accepte la nouvelle référence avec `npx vitest run -u`.
 */

let base: QuoteSnapshot;
beforeAll(async () => {
  base = await referenceSnapshot();
});

const variants: [string, (s: QuoteSnapshot) => QuoteSnapshot][] = [
  ["classique", (s) => ({ ...s, template: "classique" })],
  ["moderne", (s) => ({ ...s, template: "moderne" })],
  ["sobre", (s) => ({ ...s, template: "sobre" })],
  ["sans rétractation ni TVA réduite", (s) => ({ ...s, consumer: { withdrawal: false, reducedVatBp: [] } })],
  ["aperçu de brouillon", (s) => ({ ...s, preview: true })],
  ["récapitulatif par lot en tête", (s) => ({ ...s, layout: "synthese" })],
  ["un lot par page", (s) => ({ ...s, layout: "lots" })],
];

describe("rendu des PDF de devis", () => {
  for (const [name, make] of variants) {
    it(`reste identique : ${name}`, async () => {
      const pdf = await renderQuotePdf(make(base));
      const doc = await PDFDocument.load(pdf);
      expect({ pages: doc.getPageCount(), sha256: sha256(pdf) }).toMatchSnapshot();
    });
  }

  it("ajoute exactement une page pour le formulaire de rétractation", async () => {
    const withForm = await PDFDocument.load(await renderQuotePdf(base));
    const without = await PDFDocument.load(await renderQuotePdf({ ...base, consumer: { withdrawal: false, reducedVatBp: [1000] } }));
    expect(withForm.getPageCount()).toBe(without.getPageCount() + 1);
  });

  it("un lot par page : une page par lot chiffré en plus du récapitulatif", async () => {
    const lotsWithItems = base.sections.filter((sec) => sec.lines.some((l) => l.kind === "item")).length;
    expect(lotsWithItems).toBeGreaterThan(1);
    const detailed = await PDFDocument.load(await renderQuotePdf(base));
    const lots = await PDFDocument.load(await renderQuotePdf({ ...base, layout: "lots" }));
    expect(lots.getPageCount()).toBeGreaterThanOrEqual(detailed.getPageCount() + lotsWithItems - 1);
    // Une facture garde toujours le détail continu.
    const opts = { title: "FACTURE", label: "Facture", meta: ["Facture"], sections: [] as [string, string][] };
    const inv = await PDFDocument.load(await renderQuotePdf({ ...base, layout: "lots" }, opts));
    const invDetailed = await PDFDocument.load(await renderQuotePdf(base, opts));
    expect(inv.getPageCount()).toBe(invDetailed.getPageCount());
  });

  it("rend une facture avec ses blocs propres", async () => {
    const pdf = await renderQuotePdf(base, {
      title: "FACTURE",
      label: "Facture FA-2026-0001",
      meta: ["Facture FA-2026-0001", "Date : 12/10/2026", "Échéance : 11/11/2026"],
      afterTotals: [
        ["Acompte déjà facturé", "-500,00 €", false],
        ["Net à payer", "1 234,56 €", true],
      ],
      sections: [["Conditions de paiement", "Virement à 30 jours."]],
    });
    expect({ pages: (await PDFDocument.load(pdf)).getPageCount(), sha256: sha256(pdf) }).toMatchSnapshot();
  });
});
