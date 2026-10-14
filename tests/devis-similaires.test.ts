import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { similarQuotes } from "@/lib/services/similar-quotes";
import { comparePrices, lineKey, median, similarity, words } from "@/lib/similar-quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("ressemblance entre devis", () => {
  it("compare les mots significatifs et les montants", () => {
    expect(words("Pose de faïences murales avec colle")).toEqual(["faience", "murale", "colle"]);
    const a = { title: "Salle de bains", labels: ["Dépose baignoire", "Receveur extra-plat", "Faïence murale"], totalCents: 800000 };
    const b = { title: "Salle de bains", labels: ["Receveur extra-plat", "Faïence murale"], totalCents: 700000 };
    const c = { title: "Toiture", labels: ["Remplacement tuiles", "Gouttières zinc"], totalCents: 800000 };
    expect(similarity(a, b)).toBeGreaterThan(0.6);
    expect(similarity(a, c)).toBe(0);
    expect(lineKey("Faïence murales", "M² ")).toBe(lineKey("Murale faience", "m²"));
    expect(median([3, 1, 2, 10])).toBe(3);
    expect(
      comparePrices(
        [{ label: "Faïence murale", unit: "m²", unitPriceCents: 5500 }],
        [
          { label: "Faïence murale", unit: "m²", unitPriceCents: 4800 },
          { label: "Faience murales", unit: "m²", unitPriceCents: 5200 },
        ],
        [{ label: "Faïence murale", unit: "m²", unitPriceCents: 6500 }],
      ),
    ).toEqual([{ label: "Faïence murale", unit: "m²", priceCents: 5500, wonCents: 5000, lostCents: 6500, gapBp: 1000 }]);
  });
});

describe("devis similaires de l'entreprise", () => {
  let db: Database;
  let ctx: Ctx;
  let current: string;

  async function quote(title: string, lines: Record<string, unknown>[], decision?: "accept" | "refuse") {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, title, sections: [{ ...d.sections[0], lines: lines.map((l) => line(l)) }] }, d.draftRevision);
    if (decision) {
      await issueQuote(ctx, id);
      await recordResponseManually(ctx, id, {
        decision,
        version: 1,
        proof: "Réponse reçue par téléphone",
        ...(decision === "refuse" ? { reasonCode: "prix" } : {}),
      });
    }
    return id;
  }

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "similaires@exemple.fr");
    await completeProfile(ctx);
    const faience = (p: string) => ({ label: "Faïence murale", quantity: "20", unit: "m²", unitPrice: p });
    const receveur = (p: string) => ({ label: "Receveur extra-plat", quantity: "1", unit: "u", unitPrice: p });
    await quote("Salle de bains Martin", [faience("48"), receveur("450")], "accept");
    await quote("Salle de bains Durand", [faience("52"), receveur("480")], "accept");
    await quote("Salle de bains Petit", [faience("65"), receveur("520")], "refuse");
    await quote("Toiture Bernard", [{ label: "Remplacement de tuiles", quantity: "80", unit: "m²", unitPrice: "70" }], "accept");
    current = await quote("Salle de bains Leroy", [faience("55"), receveur("470")]);
  });

  it("retrouve les devis proches et compare les prix", async () => {
    const r = await similarQuotes(ctx, current);
    expect(r.quotes.map((q) => q.title).sort()).toEqual(["Salle de bains Durand", "Salle de bains Martin", "Salle de bains Petit"]);
    expect([r.won, r.lost]).toEqual([2, 1]);
    expect(r.quotes.find((q) => !q.won)).toMatchObject({ status: "refused" });
    expect(r.prices.map((p) => [p.label, p.priceCents, p.wonCents, p.lostCents, p.gapBp])).toEqual([
      ["Faïence murale", 5500, 5000, 6500, 1000],
      ["Receveur extra-plat", 47000, 46500, 52000, 108],
    ]);
  });

  it("reste réservé à l'entreprise", async () => {
    const other = await signUp(db, "similaires-autre@exemple.fr", "Autre");
    await expect(similarQuotes(other, current)).rejects.toMatchObject({ status: 404 });
  });
});
