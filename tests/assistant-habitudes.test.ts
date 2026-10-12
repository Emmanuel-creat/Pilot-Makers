import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { assistantQuality, compareProposal, samePrice } from "@/lib/services/assistant-habits";
import { markProposalAdded, proposeDraft } from "@/lib/services/assistant";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
const TEXT = "Salle de bain de 6 m2, dépose du carrelage existant, pose de carrelage au sol, faïence murale sur 14 m2.";

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "habitudes@exemple.fr");
  await completeProfile(ctx);
});

describe("habitudes et qualité de l'assistant de préparation", () => {
  it("compare les lignes ajoutées à ce qui est émis", () => {
    expect(samePrice("45", "45,00")).toBe(true);
    expect(samePrice("45", "46")).toBe(false);
    const proposed = ["a", "b", "c", "d"].map((id) => ({ id, sourceKey: id, label: `Ligne ${id}`, unit: "m²", unitPrice: "10" }));
    const sections = [
      {
        id: "s",
        title: "",
        description: "",
        lines: [
          { id: "b", label: "Ligne b modifiée", unit: "m²", unitPrice: "10" },
          { id: "a", label: "Ligne a", unit: "m²", unitPrice: "10,00" },
        ],
      },
    ] as never;
    const c = compareProposal(proposed, ["a", "b", "c"], sections);
    expect([c.kept, c.edited, c.removed]).toEqual([1, 1, 1]);
    expect(c.learned.find((l) => l.sourceKey === "b")).toMatchObject({ label: "Ligne b modifiée", position: 0 });
  });

  it("mesure les lignes gardées à l'émission puis reprend libellé, prix et ordre préférés", async () => {
    const quoteId = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const p = await proposeDraft(ctx, { text: TEXT, quoteId });
    expect(p.proposalId).toBeTruthy();
    expect(p.quality).toEqual({ lines: 0, keptPercent: null });
    const lines = p.sections.flatMap((s) => s.lines).filter((l) => l.kind === "item");
    expect(lines.length).toBeGreaterThanOrEqual(3);
    const [first, second, ...rest] = lines;

    // L'artisan garde la première ligne, renomme et reprice la deuxième, retire la troisième, et met la deuxième en tête.
    const d = await getDraft(ctx, quoteId);
    const edited = { ...second, label: "Pose soignée de carrelage", unitPrice: "52", quantity: second.quantity || "6" };
    await saveDraft(
      ctx,
      quoteId,
      {
        ...d,
        title: "Salle de bain",
        site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
        paymentTerms: "Solde à réception de facture.",
        sections: [{ id: d.sections[0].id, title: "", description: "", lines: [edited, { ...first, quantity: first.quantity || "1" }] }],
      },
      d.draftRevision,
    );
    await markProposalAdded(ctx, p.proposalId!, { quoteId, lineIds: [first.id, second.id, rest[0].id] });
    await issueQuote(ctx, quoteId);

    const q = await assistantQuality(db, ctx.orgId);
    expect(q).toMatchObject({ lines: 3, kept: 1, edited: 1, removed: 1, keptPercent: 33 });

    const again = await proposeDraft(ctx, { text: TEXT });
    expect(again.habitsApplied).toBeGreaterThanOrEqual(1);
    const all = again.sections.flatMap((s) => s.lines);
    const learned = all.find((l) => l.label === "Pose soignée de carrelage");
    expect(learned).toBeTruthy();
    if (!learned!.catalogItemId) expect(learned!.unitPrice).toBe("52");
    expect(again.explanations[learned!.id]).toContain("repris de vos devis précédents");
    // Ordre préféré : la ligne mise en tête par l'artisan passe avant l'autre dans sa section.
    const section = again.sections.find((s) => s.lines.some((l) => l.id === learned!.id))!;
    const firstAgain = section.lines.find((l) => l.label === first.label);
    if (firstAgain) expect(section.lines.indexOf(learned!)).toBeLessThan(section.lines.indexOf(firstAgain));
    expect(again.quality).toEqual({ lines: 3, keptPercent: 33 });
  });

  it("refuse de marquer une proposition d'une autre entreprise", async () => {
    const other = await signUp(db, "autre-habitudes@exemple.fr");
    const p = await proposeDraft(ctx, { text: TEXT });
    const quoteId = await createQuote(other, {});
    await expect(markProposalAdded(other, p.proposalId!, { quoteId, lineIds: [] })).rejects.toMatchObject({ status: 404 });
  });
});
