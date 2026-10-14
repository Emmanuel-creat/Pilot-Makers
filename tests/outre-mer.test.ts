import { describe, expect, it } from "vitest";
import { createQuote, getDraft, previewQuote, saveDraft } from "@/lib/services/quotes";
import { overseasIssues, territoryOf } from "@/lib/overseas";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("chantiers outre-mer", () => {
  it("reconnaît les territoires", () => {
    expect(territoryOf("97110")).toEqual({ name: "Guadeloupe", regime: "dom_tva" });
    expect(territoryOf("97150")).toEqual({ name: "Saint-Martin", regime: "collectivite" });
    expect(territoryOf("97300")?.regime).toBe("sans_tva");
    expect(territoryOf("20000")).toBeNull();
    expect(territoryOf("")).toBeNull();
  });
  it("signale les taux de métropole sur un chantier outre-mer", () => {
    expect(overseasIssues("97400", [850, 210])).toEqual([]);
    const [i] = overseasIssues("97400", [2000, 850, 550]);
    expect(i.blocking).toBe(false);
    expect(i.message).toContain("à La Réunion");
    expect(i.message).toContain("20 %, 5,5 %");
    expect(overseasIssues("97600", [0])).toEqual([]);
    expect(overseasIssues("97600", [2000])[0].message).toContain("article 294");
    expect(overseasIssues("97133", [850])[0].message).toContain("à Saint-Barthélemy");
    expect(overseasIssues("97400", [2000], true)).toEqual([]);
    expect(overseasIssues("69003", [2000])).toEqual([]);
  });
});

describe("devis outre-mer", () => {
  it("avertit sans bloquer quand un chantier à La Réunion est à 20 %", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "reunion@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    const site = { line1: "1 rue de Paris", line2: "", postalCode: "97400", city: "Saint-Denis" };
    await saveDraft(ctx, id, { ...d, title: "Carrelage", site, sections: [{ ...d.sections[0], lines: [line({ vatPercent: "20" })] }] }, d.draftRevision);
    const p = await previewQuote(ctx, id);
    const i = p.issues.find((x) => x.code === "overseas_vat");
    expect(i?.message).toContain("à La Réunion");
    expect(p.canIssue).toBe(true);
  });
});
