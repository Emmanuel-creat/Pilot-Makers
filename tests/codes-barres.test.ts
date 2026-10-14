import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { assignCode, lookupCode } from "@/lib/services/barcode";
import { createItem } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { createStockItem } from "@/lib/services/stock";
import { importSupplierPrices } from "@/lib/services/supplier-prices";
import { canonical, checkDigit, codeKind, isGtin, normalizeCode, variants } from "@/lib/barcode";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("codes-barres", () => {
  it("calcule la clé de contrôle", () => {
    expect(checkDigit("400638133393")).toBe(1);
    expect(checkDigit("9638507")).toBe(4);
  });
  it("reconnaît les GTIN valides", () => {
    expect(isGtin("4006381333931")).toBe(true);
    expect(isGtin("96385074")).toBe(true);
    expect(isGtin("036000291452")).toBe(true);
    expect(isGtin("4006381333932")).toBe(false);
    expect(isGtin("12345")).toBe(false);
  });
  it("normalise et nomme les codes", () => {
    expect(normalizeCode(" 400 6381-333931 ")).toBe("4006381333931");
    expect(codeKind("4006381333931")).toBe("EAN-13");
    expect(codeKind("ABC-12")).toBe("Référence");
    expect(codeKind("4006381333932")).toBe("Code numérique (clé non reconnue)");
  });
  it("ramène UPC-A et GTIN-14 à l'EAN-13", () => {
    expect(canonical("036000291452")).toBe("0036000291452");
    expect(canonical("00036000291452")).toBe("0036000291452");
    expect(canonical("ref-a1")).toBe("REFA1");
    expect(variants("036000291452")).toEqual(expect.arrayContaining(["0036000291452", "036000291452", "00036000291452"]));
  });
});

describe("scan dans le catalogue et le stock", () => {
  let db: Database;
  let ctx: Ctx;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "scan@exemple.fr");
    await completeProfile(ctx);
  });

  it("retrouve un code dans les tarifs, l'associe puis le retrouve partout", async () => {
    const item = await createItem(ctx, { name: "Colle carrelage C2", category: "materiau", vat_percent: "20", unit: "sac", unit_cost: "20", unit_price: "32" });
    await importSupplierPrices(
      ctx,
      { supplier: "Cedeo", minMarginPercent: "0" },
      [
        ["REFCIALE", "EAN", "LIBELLE240", "UB", "PRIX NET"],
        ["COL-25", "4006381333931", "Mortier colle C2 sac 25 kg", "SAC", "21,50"],
      ],
      true,
    );
    let r = await lookupCode(ctx, " 4006381 333931");
    expect(r?.kind).toBe("EAN-13");
    expect(r?.catalog).toHaveLength(0);
    expect(r?.prices[0]).toMatchObject({ supplier: "Cedeo", netCents: 2150 });
    expect((await lookupCode(ctx, "col-25"))?.prices).toHaveLength(1);

    await expect(assignCode(ctx, { target: "catalog", id: item, code: "4006381333932" })).rejects.toMatchObject({ status: 400 });
    await assignCode(ctx, { target: "catalog", id: item, code: "4006381333931" });
    const stockId = await createStockItem(ctx, { catalogItemId: item });
    r = await lookupCode(ctx, "04006381333931");
    expect(r?.catalog.map((c) => c.id)).toEqual([item]);
    expect(r?.stock.map((s) => s.id)).toEqual([stockId]);

    const other = await createStockItem(ctx, { label: "Vis inox 4x40" });
    await assignCode(ctx, { target: "stock", id: other, code: "96385074" });
    expect((await lookupCode(ctx, "96385074"))?.stock.map((s) => s.label)).toEqual(["Vis inox 4x40"]);
    expect(await lookupCode(ctx, "  ")).toBeNull();
  });
});
