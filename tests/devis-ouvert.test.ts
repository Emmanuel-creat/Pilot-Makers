import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { centsToDecimal, exchangeSchema, fromExchange, JSON_SCHEMA, toDecimal } from "@/lib/quote-exchange";
import type { Ctx } from "@/lib/services/context";
import { exportQuoteExchange, importQuoteExchange } from "@/lib/services/quote-exchange";
import { createQuote, getDraft, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("format Devis ouvert", () => {
  it("montants décimaux sans erreur d'arrondi", () => {
    expect(centsToDecimal(125050)).toBe("1250.50");
    expect(centsToDecimal(-5)).toBe("-0.05");
    expect(toDecimal("1 250,5")).toBe("1250.5");
    expect(toDecimal("abc")).toBe("0");
  });

  it("refuse un fichier d'un autre format et signale le champ fautif", () => {
    expect(() => fromExchange({ format: "autre" })).toThrow(/Devis ouvert/);
    expect(() =>
      fromExchange({
        format: "devis-ouvert",
        version: "1.0",
        document: {
          seller: { name: "X" },
          sections: [{ lines: [{ label: "Pose", quantity: "2,5", unitPrice: "10", vatRate: "10" }] }],
          totals: { totalHt: "25", totalVat: "2.5", totalTtc: "27.5" },
        },
      }),
    ).toThrow(/quantity.*point/);
    expect(() => fromExchange({ format: "devis-ouvert", version: "2.0", document: {} })).toThrow(/Version/);
  });

  it("le schéma publié décrit les mêmes champs obligatoires", () => {
    expect(JSON_SCHEMA.$defs.line.required).toEqual(["label", "quantity", "unitPrice", "vatRate"]);
    expect(Object.keys(JSON_SCHEMA.properties.document.properties).sort()).toEqual(Object.keys(exchangeSchema.shape.document.shape).sort());
  });
});

describe("export puis import entre deux entreprises", () => {
  let db: Database;
  let a: Ctx;
  let b: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    a = await signUp(db, "echange-a@exemple.fr");
    await completeProfile(a);
    b = await signUp(db, "echange-b@exemple.fr", "Plomberie Roux");
    await completeProfile(b);
  });

  it("aller-retour fidèle, sans coûts ni notes internes", async () => {
    const id = await createQuote(a, { customerId: await makeCustomer(a), title: "Salle de bains" });
    const d = await getDraft(a, id);
    await saveDraft(
      a,
      id,
      {
        ...d,
        internalNotes: "Marge serrée",
        sections: [
          {
            ...d.sections[0],
            title: "Carrelage",
            lines: [
              line({ unitPrice: "45,50", quantity: "12,5", unitCost: "20", internalNote: "secret" }),
              line({ kind: "note", label: "Texte seul", quantity: "", unitPrice: "" }),
              line({ label: "Option faïence", optional: true, unitPrice: "30", quantity: "5", vatPercent: "20" }),
            ],
          },
        ],
      },
      d.draftRevision,
    );
    const { doc, filename } = await exportQuoteExchange(a, id);
    expect(filename).toMatch(/\.devis\.json$/);
    expect(doc.document.seller.siret).not.toBe("");
    expect(doc.document.buyer?.name).not.toBe("");
    const json = JSON.stringify(doc);
    expect(json).not.toContain("secret");
    expect(json).not.toContain("Marge serrée");
    expect(json).not.toContain("unitCost");
    expect(doc.document.sections[0].lines).toHaveLength(2);
    expect(doc.document.sections[0].lines[0]).toMatchObject({ quantity: "12.5", unitPrice: "45.50", vatRate: "10" });
    expect(doc.document.totals.totalHt).toBe("568.75");

    const r = await importQuoteExchange(b, json, null);
    expect(r.warnings).toEqual([]);
    const copy = await getDraft(b, r.id);
    expect(copy.title).toBe("Salle de bains");
    expect(copy.sections[0].lines.map((l) => l.label)).toEqual(["Pose de carrelage", "Option faïence"]);
    expect(copy.sections[0].lines[1].optional).toBe(true);
    expect(copy.internalNotes).toMatch(/Repris du devis/);
    const back = await exportQuoteExchange(b, r.id);
    expect(back.doc.document.totals).toEqual(doc.document.totals);
  });

  it("signale des totaux déclarés incohérents et refuse un fichier illisible", async () => {
    const bad = {
      format: "devis-ouvert",
      version: "1.0",
      document: {
        title: "Toiture",
        seller: { name: "Couvreur" },
        sections: [{ title: "Couverture", lines: [{ label: "Tuiles", quantity: "10", unit: "m²", unitPrice: "50", vatRate: "10" }] }],
        totals: { totalHt: "999.00", totalVat: "0", totalTtc: "999.00" },
      },
    };
    const r = await importQuoteExchange(b, JSON.stringify(bad), null);
    expect(r.warnings[0]).toMatch(/diffèrent/);
    await expect(importQuoteExchange(b, "pas du json", null)).rejects.toThrow(/illisible/);
  });
});
