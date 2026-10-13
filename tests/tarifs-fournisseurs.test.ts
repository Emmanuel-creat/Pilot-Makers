import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { createItem, getItem, priceHistory } from "@/lib/services/catalog";
import type { Ctx } from "@/lib/services/context";
import { dismissCostAlert, importSupplierPrices, listCostAlerts, marginBp, parseSupplierTable } from "@/lib/services/supplier-prices";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let colle: string;
let faience: string;
let joint: string;

const FILE = [
  ["REFCIALE", "LIBELLE240", "UB", "PRIXBASE", "REMISE"],
  ["CK-2040", "Colle carrelage C2 25 kg", "SAC", "32,00", "25"],
  ["FA-3060", "Faïence blanche 30x60", "M2", "28,50", "0,30"],
  ["JT-0005", "Joint gris 5 kg", "SAC", "18", ""],
  ["", "Ligne sans référence", "U", "4", ""],
  ["XX-1", "Prix illisible", "U", "sur demande", ""],
];

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "tarifs@exemple.fr");
  await completeProfile(ctx);
  colle = await createItem(ctx, {
    name: "Colle C2",
    category: "materiau",
    vat_percent: "20",
    unit: "u",
    unit_cost: "22",
    unit_price: "30",
    supplier: "Négoce Rhône",
    supplier_ref: "CK-2040",
  });
  faience = await createItem(ctx, {
    name: "Faïence 30x60",
    category: "materiau",
    vat_percent: "20",
    unit: "m²",
    unit_cost: "18",
    unit_price: "35",
    supplier: "négoce rhône",
    reference: "FA-3060",
  });
  joint = await createItem(ctx, {
    name: "Joint gris",
    category: "materiau",
    vat_percent: "20",
    unit: "u",
    unit_cost: "18",
    unit_price: "25",
    supplier: "Négoce Rhône",
    supplier_ref: "JT-0005",
  });
  await createItem(ctx, {
    name: "Colle d'un autre fournisseur",
    category: "materiau",
    vat_percent: "20",
    unit: "u",
    unit_cost: "10",
    unit_price: "20",
    supplier: "Autre",
    supplier_ref: "CK-2040",
  });
});

describe("tarifs fournisseurs", () => {
  it("reconnaît les colonnes d'un fichier de négoce et calcule le prix net remisé", () => {
    const { rows, columns } = parseSupplierTable(FILE);
    expect(columns).toEqual(["reference", "label", "unit", "list", "discount"]);
    expect(rows[0]).toMatchObject({ reference: "CK-2040", net4: 240000, list4: 320000, discountBp: 2500 });
    expect(rows[1]).toMatchObject({ net4: 199500, discountBp: 3000 });
    expect(rows[2]).toMatchObject({ net4: 180000, discountBp: null });
    expect(rows[3].error).toBe("Référence manquante");
    expect(rows[4].error).toBe("Prix illisible");
    expect(() =>
      parseSupplierTable([
        ["Nom", "Ville"],
        ["a", "b"],
      ]),
    ).toThrow(/référence/);
  });

  it("montre l'aperçu sans rien modifier", async () => {
    const r = await importSupplierPrices(ctx, { supplier: "Négoce Rhône", minMarginPercent: "25" }, FILE, false);
    expect(r.applied).toBe(false);
    expect(r.linked).toBe(3);
    expect(r.unchanged).toBe(1);
    expect(r.errors).toHaveLength(2);
    const colleChange = r.changes.find((c) => c.itemId === colle)!;
    // Coût 24 € pour une vente à 30 € : marge de 20 %, sous le seuil de 25 %.
    expect(colleChange).toMatchObject({ oldCost4: 220000, newCost4: 240000, marginBp: 2000, alert: true });
    expect(r.changes.find((c) => c.itemId === faience)).toMatchObject({ newCost4: 199500, alert: false });
    expect((await getItem(ctx, colle)).unit_cost4).toBe(220000);
  });

  it("met à jour les prix d'achat, garde l'historique et signale la marge trop basse", async () => {
    const r = await importSupplierPrices(ctx, { supplier: "Négoce Rhône", minMarginPercent: "25" }, FILE, true);
    expect(r).toMatchObject({ applied: true, increases: 2, alerts: 1 });
    expect((await getItem(ctx, colle)).unit_cost4).toBe(240000);
    expect((await getItem(ctx, colle)).unit_price4).toBe(300000);
    expect((await getItem(ctx, joint)).unit_cost4).toBe(180000);
    const other = await db.query<{ unit_cost4: string }>("SELECT unit_cost4 FROM catalog_items WHERE supplier='Autre'");
    expect(Number(other[0].unit_cost4)).toBe(100000);
    expect((await priceHistory(ctx, colle))[0]).toMatchObject({ old_cost4: 220000, new_cost4: 240000 });

    const alerts = await listCostAlerts(ctx);
    expect(alerts.map((a) => [a.name, a.margin_bp])).toEqual([["Colle C2", 2000]]);
    await dismissCostAlert(ctx, alerts[0].id);
    expect(await listCostAlerts(ctx)).toEqual([]);
    const saved = await db.query<{ n: string }>("SELECT count(*) AS n FROM supplier_prices WHERE org_id=$1", [ctx.orgId]);
    expect(Number(saved[0].n)).toBe(3);
  });

  it("réserve l'import aux personnes qui voient les coûts", async () => {
    const member = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(importSupplierPrices(member, { supplier: "Négoce Rhône" }, FILE, false)).rejects.toMatchObject({ status: 403 });
    expect(marginBp(0, 100)).toBeNull();
  });
});
