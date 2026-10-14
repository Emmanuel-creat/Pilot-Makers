import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { buildDeck, slideCount } from "@/lib/presentation";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, getVersion, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("présentation sur tablette", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "presentation@exemple.fr");
    await completeProfile(ctx);
  });

  it("découpe le devis émis en écrans sans données internes", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Salle d'eau",
        site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" },
        sections: [
          {
            ...d.sections[0],
            title: "Carrelage",
            lines: [
              { ...line(), unitCost: "12", internalNote: "Marge confortable" },
              { ...line(), id: crypto.randomUUID(), label: "Frise décorative", optional: true },
            ],
          },
        ],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    const v = await getVersion(ctx.db, ctx.orgId, id, 1);
    const deck = buildDeck(v.snapshot);
    expect(deck.title).toBe("Salle d'eau");
    expect(deck.site).toBe("1 rue A, 69001 Lyon");
    expect(deck.sections[0].title).toBe("Carrelage");
    expect(deck.sections[0].lines.map((l) => l.optional)).toEqual([false, true]);
    expect(deck.sections[0].lines[0].quantity).toMatch(/\d/);
    expect(deck.totals.ttcCents).toBe(v.snapshot.calc.totalTtcCents);
    const json = JSON.stringify(deck);
    expect(json).not.toContain("Marge confortable");
    expect(json).not.toMatch(/cost|margin/i);
    expect(slideCount(deck)).toBe(3);
  });
});
