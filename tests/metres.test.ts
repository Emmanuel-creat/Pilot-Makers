import { describe, expect, it } from "vitest";
import { computeMeasure, parseMetres, sanitizeMeasure } from "@/lib/calc/measure";
import { guessKind } from "@/components/editor/MeasureDialog";
import { createQuote, getDraft, getVersion, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const row = (a: string, b = "", c = "", count = "1", label = "") => ({ label, count, a, b, c });

describe("calcul des métrés", () => {
  it("lit les cotes à la française", () => {
    expect(parseMetres("3,5")).toBe(3500);
    expect(parseMetres(" 12.25 ")).toBe(12250);
    expect(parseMetres("1 250")).toBe(1_250_000);
    expect(parseMetres("-2")).toBeNull();
    expect(parseMetres("abc")).toBeNull();
    expect(parseMetres("")).toBeNull();
  });

  it("surface d'un sol en deux zones", () => {
    const r = computeMeasure({
      kind: "surface",
      items: [row("4", "3,5", "", "1", "Séjour"), row("2,1", "1,8", "", "2", "Chambres")],
      deductions: [],
    });
    expect(r.ok).toBe(true);
    // 14 + 2 × 3,78 = 21,56
    expect(r.quantity).toBe("21,56");
    expect(r.unit).toBe("m²");
    expect(r.detail).toContain("Chambres : 2 × 2,1 × 1,8 = 7,56 m²");
  });

  it("murs d'une pièce, porte et fenêtres déduites", () => {
    const r = computeMeasure({
      kind: "murs",
      items: [row("4", "3", "2,5", "1", "Chambre")],
      deductions: [row("0,83", "2,04", "", "1", "Porte"), row("1,2", "1,35", "", "2", "Fenêtres")],
    });
    // 2 × 7 × 2,5 = 35 ; porte 1,69 (1,6932) ; fenêtres 2 × 1,62 = 3,24 ; reste 30,07
    expect(r.rows[0].hundredths).toBe(3500);
    expect(r.deductions.map((d) => d.hundredths)).toEqual([169, 324]);
    expect(r.quantity).toBe("30,07");
  });

  it("volume, linéaire et plinthes", () => {
    expect(computeMeasure({ kind: "volume", items: [row("5", "4", "0,12")], deductions: [] }).quantity).toBe("2,4");
    expect(computeMeasure({ kind: "lineaire", items: [row("12,5", "", "", "2")], deductions: [] }).quantity).toBe("25");
    const p = computeMeasure({ kind: "plinthes", items: [row("4", "3")], deductions: [row("0,83")] });
    expect(p).toMatchObject({ ok: true, quantity: "13,17", unit: "ml" });
  });

  it("refuse les cotes manquantes et les déductions excessives", () => {
    expect(computeMeasure({ kind: "surface", items: [row("4")], deductions: [] }).errors[0]).toMatch(/largeur/);
    expect(computeMeasure({ kind: "surface", items: [], deductions: [] }).ok).toBe(false);
    const over = computeMeasure({ kind: "surface", items: [row("1", "1")], deductions: [row("2", "2")] });
    expect(over.errors).toContain("Les ouvertures déduites dépassent la surface mesurée");
    expect(computeMeasure({ kind: "surface", items: [row("1", "1", "", "x")], deductions: [] }).ok).toBe(false);
  });

  it("devine le type selon la désignation", () => {
    expect(guessKind("Peinture des murs, deux couches")).toBe("murs");
    expect(guessKind("Pose de plinthes en chêne")).toBe("plinthes");
    expect(guessKind("Dalle béton armé")).toBe("volume");
    expect(guessKind("Chape liquide")).toBe("surface");
    expect(guessKind("Gouttière zinc")).toBe("lineaire");
    expect(guessKind("Pose de carrelage")).toBe("surface");
  });

  it("nettoie un métré reçu", () => {
    expect(sanitizeMeasure({ kind: "inconnu", items: [] })).toBeNull();
    expect(sanitizeMeasure("x")).toBeNull();
    const m = sanitizeMeasure({ kind: "surface", items: [{ label: "A".repeat(500), a: 3, b: "2" }] })!;
    expect(m.items[0]).toEqual({ label: "A".repeat(80), count: "", a: "3", b: "2", c: "" });
    expect(m.deductions).toEqual([]);
  });
});

describe("métré conservé avec la ligne", () => {
  it("enregistré dans le brouillon, absent du devis émis", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "metres@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    const measure = { kind: "surface", items: [row("4", "3,5", "", "1", "Séjour")], deductions: [] };
    const l = line({ quantity: "14", unit: "m²", measure });
    await saveDraft(ctx, id, { ...d, title: "Sol", sections: [{ ...d.sections[0], lines: [l, line({ measure: { kind: "faux" } })] }] }, d.draftRevision);
    const back = await getDraft(ctx, id);
    expect(back.sections[0].lines[0].measure).toMatchObject({ kind: "surface", items: [{ label: "Séjour", a: "4", b: "3,5" }] });
    expect(back.sections[0].lines[1].measure).toBeUndefined();
    await issueQuote(ctx, id);
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(JSON.stringify(v.snapshot)).not.toContain("Séjour");
  });
});
