import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { expiredPrices, priceChanges } from "@/lib/live-pricing";
import { createItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { applyLivePrices, livePrices } from "@/lib/services/live-pricing";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("comparaison au catalogue", () => {
  const base = { id: "l1", label: "Carrelage 60x60", unitPrice: "40", unitCost: "25", catalogPrice4: 400_000, catalogCost4: 250_000, priceValidUntil: null };

  it("signale les prix et coûts qui ont bougé d'au moins un centime", () => {
    expect(priceChanges([base])).toEqual([]);
    expect(priceChanges([{ ...base, catalogPrice4: 420_000 }])).toEqual([
      { lineId: "l1", label: "Carrelage 60x60", oldPrice4: 400_000, newPrice4: 420_000, deltaBp: 500, oldCost4: 250_000, newCost4: 250_000 },
    ]);
    expect(priceChanges([{ ...base, catalogCost4: 270_000 }])[0]).toMatchObject({ deltaBp: 0, newCost4: 270_000 });
    expect(priceChanges([{ ...base, unitPrice: "40,004", catalogPrice4: 400_000 }])).toEqual([]);
    expect(priceChanges([{ ...base, unitPrice: "" }])).toEqual([]);
  });

  it("prix fournisseur dont la validité est dépassée", () => {
    expect(
      expiredPrices(
        [
          { ...base, priceValidUntil: "2026-10-01" },
          { ...base, label: "Colle", priceValidUntil: "2026-12-31" },
        ],
        "2026-10-14",
      ),
    ).toEqual(["Carrelage 60x60"]);
  });
});

describe("devis vivant", () => {
  let db: Database;
  let ctx: Ctx;
  let quoteId: string;
  let itemId: string;
  let lineId: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "vivant@exemple.fr");
    await completeProfile(ctx);
    const customerId = await makeCustomer(ctx);
    itemId = await createItem(ctx, { name: "Carrelage grès 60x60", category: "materiau", vat_percent: "10", unit: "m²", unit_price: "40", unit_cost: "25" });
    quoteId = await createQuote(ctx, { customerId, title: "Sol de la cuisine" });
    const draft = await getDraft(ctx, quoteId);
    const l = line({ catalogItemId: itemId, nature: "materiau", label: "Carrelage grès 60x60", quantity: "20", unit: "m²", unitPrice: "40", unitCost: "25" });
    lineId = l.id;
    await saveDraft(ctx, quoteId, { ...draft, sections: [{ ...draft.sections[0], lines: [l, line()] }] }, draft.draftRevision);
  });

  it("rien à signaler tant que le catalogue n'a pas changé", async () => {
    expect(await livePrices(ctx, quoteId)).toMatchObject({ changes: [], expired: [], needsRevision: false });
  });

  it("un devis émis repasse en brouillon pour reprendre le nouveau prix", async () => {
    await issueQuote(ctx, quoteId);
    await db.query("UPDATE catalog_items SET unit_price4=420000, unit_cost4=270000 WHERE id=$1", [itemId]);
    const r = await livePrices(ctx, quoteId);
    expect(r).toMatchObject({ status: "ready", needsRevision: true });
    expect(r.changes).toEqual([expect.objectContaining({ lineId, oldPrice4: 400_000, newPrice4: 420_000, deltaBp: 500 })]);
    await expect(applyLivePrices(ctx, quoteId, [])).rejects.toThrow(/au moins une ligne/);
    expect(await applyLivePrices(ctx, quoteId, [lineId])).toEqual({ revised: true, updated: 1 });
    const d = await getDraft(ctx, quoteId);
    expect(d.status).toBe("draft");
    expect(d.sections[0].lines[0]).toMatchObject({ unitPrice: "42,00", unitCost: "27,00" });
    expect((await livePrices(ctx, quoteId)).changes).toEqual([]);
    const events = await db.query<{ type: string }>("SELECT type FROM document_events WHERE quote_id=$1 ORDER BY created_at", [quoteId]);
    expect(events.map((e) => e.type)).toContain("prices.refreshed");
  });

  it("un devis signé ne suit plus le catalogue", async () => {
    await issueQuote(ctx, quoteId);
    await recordResponseManually(ctx, quoteId, { decision: "accept", version: 2, proof: "Bon pour accord signé" });
    await db.query("UPDATE catalog_items SET unit_price4=450000 WHERE id=$1", [itemId]);
    expect((await livePrices(ctx, quoteId)).changes).toEqual([]);
    await expect(applyLivePrices(ctx, quoteId, [lineId])).rejects.toThrow(/signé ou clos/);
  });
});
