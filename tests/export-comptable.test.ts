import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { DEFAULT_PLAN, expenseAccount } from "@/lib/services/accounting-plan";
import type { Ctx } from "@/lib/services/context";
import { addExpense, reviewExpenses } from "@/lib/services/expenses";
import { buildAccountingExport, CSV_COLUMNS } from "@/lib/services/fec";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
const today = new Date().toISOString().slice(0, 10);
const year = new Date().getFullYear();
const cents = (s: string) => Math.round(Number((s || "0").replace(",", ".")) * 100);

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "export-comptable@exemple.fr");
  await completeProfile(ctx);
});

describe("exports vers les logiciels comptables", () => {
  it("comptes de charge par catégorie", () => {
    expect(expenseAccount(DEFAULT_PLAN, "carburant")).toBe("606140");
    expect(expenseAccount(DEFAULT_PLAN, "fournitures")).toBe("606300");
    expect(expenseAccount(DEFAULT_PLAN, "autre")).toBe("628000");
    expect(expenseAccount(DEFAULT_PLAN, "repas")).toBe("625100");
  });

  it("notes de frais validées et remboursement au journal, équilibrés", async () => {
    const perso = await addExpense(ctx, { date: today, merchant: 'Relais; du "Pont"', category: "repas", amount: "23,40", vat: "2,13", payment: "perso" });
    const card = await addExpense(ctx, { date: today, merchant: "Station", category: "carburant", amount: "80", vat: "13,33", payment: "entreprise" });
    await addExpense(ctx, { date: today, merchant: "Non validée", category: "autre", amount: "10", vat: "", payment: "perso" });
    await reviewExpenses(ctx, [perso, card], "valide");
    await reviewExpenses(ctx, [perso], "rembourse");

    const fec = await buildAccountingExport(ctx, `${year}-01-01`, `${year}-12-31`, "fec");
    const rows = fec.content
      .split("\r\n")
      .filter(Boolean)
      .slice(1)
      .map((l) => l.split("\t"));
    expect(rows.every((r) => r.length === 18)).toBe(true);
    const nf = rows.filter((r) => r[0] === "NF");
    expect(nf.some((r) => r[4] === "625100" && r[11] === "21,27")).toBe(true);
    expect(nf.some((r) => r[4] === "445660" && r[11] === "2,13")).toBe(true);
    expect(nf.some((r) => r[4] === "421000" && r[12] === "23,40" && r[6].startsWith("S"))).toBe(true);
    expect(nf.some((r) => r[4] === "512000" && r[12] === "80,00")).toBe(true);
    expect(rows.some((r) => r[10].includes("Non validée"))).toBe(false);
    const refund = rows.filter((r) => r[0] === "BQ" && r[10].startsWith("Remboursement frais"));
    expect(refund.map((r) => [r[4], r[11], r[12]])).toEqual([
      ["421000", "23,40", "0,00"],
      ["512000", "0,00", "23,40"],
    ]);
    const balance = new Map<string, number>();
    for (const r of rows) balance.set(r[2], (balance.get(r[2]) ?? 0) + cents(r[11]) - cents(r[12]));
    expect([...balance.values()].every((v) => v === 0)).toBe(true);

    const csv = await buildAccountingExport(ctx, `${year}-01-01`, `${year}-12-31`, "csv");
    expect(csv.contentType).toContain("text/csv");
    expect(csv.content.startsWith("﻿" + CSV_COLUMNS.join(";"))).toBe(true);
    expect(csv.content).toContain('"Repas Relais; du ""Pont"""');
    expect(csv.content.split("\r\n").filter(Boolean)).toHaveLength(rows.length + 1);
    expect(csv.filename).toMatch(/^ecritures-\d{8}-\d{8}\.csv$/);
    await expect(buildAccountingExport(ctx, `${year}-01-01`, `${year}-12-31`, "sage")).rejects.toMatchObject({ status: 400 });
  });
});
