import { describe, expect, it } from "vitest";
import { priceBreakdown } from "@/lib/price-breakdown";
import type { Ctx } from "@/lib/services/context";
import type { QuoteSnapshot } from "@/lib/services/quote-types";
import { createQuote, getDraft, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("où va l'argent du client", () => {
  it("répartit le prix du devis émis par nature de ligne, remise globale comprise, avec le prix de l'heure", async () => {
    const db = await freshDb();
    const ctx: Ctx = await signUp(db, "argent@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Salle de bains",
        globalDiscount: "10",
        site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" },
        sections: [
          {
            ...d.sections[0],
            lines: [
              line({ nature: "materiau", label: "Carrelage", unit: "m²", quantity: "20", unitPrice: "30" }),
              line({ nature: "main_oeuvre", label: "Pose", unit: "h", quantity: "10", unitPrice: "50" }),
              line({ nature: "deplacement", label: "Déplacement", unit: "u", quantity: "1", unitPrice: "100" }),
              { ...line(), kind: "note", label: "Note", unitPrice: "", quantity: "" },
            ],
          },
        ],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    const s = (await db.query<{ snapshot: QuoteSnapshot }>("SELECT snapshot FROM quote_versions WHERE quote_id=$1", [id]))[0].snapshot;
    const b = priceBreakdown(s)!;
    // 600 + 500 + 100 = 1 200 € HT, moins 10 % : 1 080 €
    expect(b.totalHtCents).toBe(108_000);
    expect(b.parts.map((p) => [p.key, p.htCents, p.share])).toEqual([
      ["materiau", 54_000, 50],
      ["main_oeuvre", 45_000, 42],
      ["deplacement", 9_000, 8],
    ]);
    expect(b.parts.reduce((a, p) => a + p.htCents, 0)).toBe(b.totalHtCents);
    expect(b.vatCents + b.totalHtCents).toBe(b.totalTtcCents);
    expect(b.labour).toEqual({ hours: 10, hourlyHtCents: 4_500 });
    expect(JSON.stringify(b)).not.toMatch(/marg/i);
    expect(priceBreakdown({ ...s, calc: { ...s.calc, totalHtCents: 0 } })).toBeNull();
  });
});
