import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { longestLead, productSummary, readProductInfo } from "@/lib/product-info";
import { createItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { getProductInfo, quoteProducts, saveProductInfo } from "@/lib/services/product-info";
import { createQuote, getDraft, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("fiche produit", () => {
  it("lit, résume et trouve le délai le plus long", () => {
    const p = readProductInfo({ brand: " Atlantic ", warrantyYears: "5", leadDays: "x", performance: "COP 4,5" });
    expect(p).toEqual({ brand: "Atlantic", performance: "COP 4,5", certifications: "", warrantyYears: 5, leadDays: null });
    expect(productSummary({ ...p, leadDays: 1 })).toBe("Atlantic · COP 4,5 · garantie 5 ans · délai 1 jour");
    expect(
      longestLead([
        { label: "A", info: { ...p, leadDays: 3 } },
        { label: "B", info: { ...p, leadDays: 12 } },
        { label: "C", info: p },
      ]),
    ).toEqual({ label: "B", days: 12 });
    expect(longestLead([{ label: "C", info: p }])).toBeNull();
  });
});

describe("fiches et devis", () => {
  let db: Database;
  let ctx: Ctx;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "fiches@exemple.fr");
    await completeProfile(ctx);
  });

  it("enregistre la fiche et la reprend sur le devis", async () => {
    const item = await createItem(ctx, { name: "Pompe à chaleur", category: "materiau", vat_percent: "5.5", unit: "u", unit_price: "6000" });
    await expect(saveProductInfo(ctx, item, { leadDays: "400" })).rejects.toMatchObject({ status: 400 });
    await saveProductInfo(ctx, item, { brand: "Atlantic Alfea", performance: "COP 4,5", warrantyYears: "5", leadDays: "15" });
    expect((await getProductInfo(ctx, item)).leadDays).toBe(15);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      { ...d, sections: [{ ...d.sections[0], lines: [{ ...line(), label: "Pompe à chaleur", catalogItemId: item }, line()] }] },
      d.draftRevision,
    );
    const q = await quoteProducts(ctx, id);
    expect(q.lead).toEqual({ label: "Pompe à chaleur", days: 15 });
    expect(q.items).toEqual([{ label: "Pompe à chaleur", summary: "Atlantic Alfea · COP 4,5 · garantie 5 ans · délai 15 jours", warrantyYears: 5 }]);
    await saveProductInfo(ctx, item, {});
    expect((await quoteProducts(ctx, id)).items).toEqual([]);
  });
});
