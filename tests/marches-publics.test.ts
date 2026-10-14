import { beforeAll, describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { getDraft, saveDraft } from "@/lib/services/quotes";
import { exportTender, importTender, quoteTender } from "@/lib/services/tenders";
import { bestMatch, detectColumns, fillTable, labelSimilarity, readItems } from "@/lib/tender";
import { completeProfile, freshDb, signUp } from "./helpers";

const DPGF = [
  ["Marché de réfection des sanitaires", "", "", "", "", ""],
  ["", "", "", "", "", ""],
  ["N° art.", "Désignation des ouvrages", "U", "Qté", "P.U. HT", "Montant HT"],
  ["1", "LOT 1 PLOMBERIE", "", "", "", ""],
  ["1.1", "Fourniture et pose de WC suspendu y compris bâti-support", "u", "4", "", ""],
  ["1.2", "Lavabo céramique sur colonne", "u", "6", "", ""],
  ["2", "LOT 2 CARRELAGE", "", "", "", ""],
  ["2.1", "Carrelage sol grès cérame 30x30", "m²", "42,5", "", ""],
  ["", "Total HT", "", "", "", ""],
];

describe("bordereau : lecture", () => {
  it("trouve l'en-tête sous le titre et les colonnes", () => {
    const t = detectColumns(DPGF)!;
    expect(t.headerRow).toBe(2);
    expect(t.cols).toEqual({ ref: 0, label: 1, unit: 2, quantity: 3, price: 4, amount: 5 });
  });

  it("sépare les lots des postes et ignore les totaux", () => {
    const { kind, items } = readItems(DPGF, detectColumns(DPGF)!);
    expect(kind).toBe("dpgf");
    expect(items.map((i) => [i.ref, i.section, i.quantity])).toEqual([
      ["1", true, ""],
      ["1.1", false, "4"],
      ["1.2", false, "6"],
      ["2", true, ""],
      ["2.1", false, "42.5"],
    ]);
  });

  it("reconnaît un BPU sans quantités", () => {
    const rows = [
      ["Code", "Libellé", "Unité", "Prix unitaire HT"],
      ["A1", "Heure de main-d'oeuvre plombier", "h", ""],
    ];
    expect(readItems(rows, detectColumns(rows)!).kind).toBe("bpu");
    expect(detectColumns([["Nom", "Prénom"]])).toBeNull();
  });

  it("rapproche une désignation d'un article proche", () => {
    expect(labelSimilarity("Carrelage sol grès cérame 30x30", "Carrelage grès cérame sol", "m²", "m2")).toBeGreaterThan(0.6);
    expect(labelSimilarity("Lavabo céramique sur colonne", "Peinture des murs")).toBe(0);
    const item = readItems(DPGF, detectColumns(DPGF)!).items[1];
    expect(
      bestMatch(item, [
        { name: "WC suspendu avec bâti-support", unit: "u" },
        { name: "Douche", unit: "u" },
      ])?.item.name,
    ).toBe("WC suspendu avec bâti-support");
  });

  it("remplit le tableau et ajoute le total", () => {
    const t = detectColumns(DPGF)!;
    const out = fillTable(
      DPGF,
      t,
      new Map([
        [4, { unitCents: 45000, quantity: "4" }],
        [7, { unitCents: 5550, quantity: "42.5" }],
      ]),
    );
    expect(out[4].slice(4)).toEqual(["450,00", "1800,00"]);
    expect(out[7].slice(4)).toEqual(["55,50", "2358,75"]);
    expect(out.at(-1)![5]).toBe("4158,75");
  });

  it("ajoute les colonnes de prix absentes", () => {
    const rows = [
      ["Désignation", "Unité"],
      ["Heure de pose", "h"],
    ];
    const out = fillTable(rows, detectColumns(rows)!, new Map([[1, { unitCents: 4800, quantity: "" }]]));
    expect(out[0]).toEqual(["Désignation", "Unité", "PU HT", "Montant HT"]);
    expect(out[1][2]).toBe("48,00");
  });
});

describe("bordereau : devis", () => {
  let db: Database;
  let ctx: Ctx;
  let other: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "marches@exemple.fr");
    await completeProfile(ctx);
    other = await signUp(db, "marches-autre@exemple.fr");
    await db.query(
      `INSERT INTO catalog_items (org_id, reference, name, unit, unit_price4, vat_bp, category) VALUES
       ($1,'WC','WC suspendu avec bâti-support','u',4500000,1000,'materiau'), ($1,'CAR','Carrelage grès cérame sol','m²',555000,1000,'main_oeuvre')`,
      [ctx.orgId],
    );
  });

  it("crée le devis avec lots et prix du catalogue, puis exporte le bordereau rempli", async () => {
    const csv = DPGF.map((r) => r.join(";")).join("\n");
    const r = await importTender(ctx, { bytes: new TextEncoder().encode(csv), fileName: "dpgf.csv", title: "Sanitaires école" });
    expect(r).toMatchObject({ kind: "dpgf", items: 3, matched: 2 });
    const d = await getDraft(ctx, r.quoteId);
    expect(d.sections.map((s) => [s.title, s.lines.length])).toEqual([
      ["1 LOT 1 PLOMBERIE", 2],
      ["2 LOT 2 CARRELAGE", 1],
    ]);
    const lavabo = d.sections[0].lines[1];
    expect(lavabo).toMatchObject({ unitPrice: "0", estimated: true, quantity: "6" });
    lavabo.unitPrice = "320";
    await saveDraft(ctx, r.quoteId, d, d.draftRevision);
    expect(await quoteTender(ctx, r.quoteId)).toMatchObject({ items: 3, matched: 2 });
    const out = parseCsv((await exportTender(ctx, r.id)).csv.replace(/^﻿/, ""));
    expect(out[5].slice(4)).toEqual(["320,00", "1920,00"]);
    expect(out.at(-1)![5]).toBe("6078,75");
    await expect(exportTender(other, r.id)).rejects.toThrow();
  });

  it("refuse un tableau sans colonnes reconnues", async () => {
    await expect(importTender(ctx, { bytes: new TextEncoder().encode("a;b\n1;2"), fileName: "x.csv" })).rejects.toThrow(/Colonnes non reconnues/);
  });
});
