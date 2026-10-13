import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import {
  addExpense,
  deleteExpense,
  expensePhoto,
  expensesCsv,
  expenseTotals,
  listExpenses,
  pendingExpenses,
  reviewExpenses,
} from "@/lib/services/expenses";
import { listPurchases } from "@/lib/services/job-costs";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { acceptInvite, inviteMember } from "@/lib/services/team";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let boss: Ctx;
let worker: Ctx;
let jobId: string;
const NOW = new Date("2026-10-20T12:00:00Z");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

beforeAll(async () => {
  db = await freshDb();
  boss = await signUp(db, "frais@exemple.fr");
  await completeProfile(boss);
  const { token } = await inviteMember(boss, { email: "compagnon@exemple.fr", role: "member" });
  const w = await signUp(db, "compagnon@exemple.fr", "Perso");
  await acceptInvite(w, token);
  worker = { ...w, orgId: boss.orgId, role: "member" };
  const qid = await createQuote(boss, { customerId: await makeCustomer(boss) });
  const d = await getDraft(boss, qid);
  await saveDraft(boss, qid, { ...d, title: "Toiture", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  await issueQuote(boss, qid);
  await recordResponseManually(boss, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  jobId = await createJobFromQuote(boss, qid);
});

describe("notes de frais", () => {
  it("saisie contrôlée : montant, TVA, date, justificatif", async () => {
    const base = { date: "2026-10-19", category: "repas", amount: "18,50", merchant: "Brasserie du Port" };
    await expect(addExpense(worker, { ...base, amount: "0" }, null, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(addExpense(worker, { ...base, vat: "20" }, null, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(addExpense(worker, { ...base, date: "2026-10-25" }, null, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(addExpense(worker, { ...base, category: "cadeau" }, null, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(addExpense(worker, base, new TextEncoder().encode("texte"), NOW)).rejects.toMatchObject({ status: 400 });
    const id = await addExpense(worker, { ...base, vat: "1,68" }, JPEG, NOW);
    expect((await expensePhoto(worker, id)).type).toBe("image/jpeg");
    await addExpense(worker, { date: "2026-10-20", category: "fournitures", amount: "36", vat: "6", merchant: "Point P", jobId }, null, NOW);
    await addExpense(worker, { date: "2026-10-20", category: "carburant", amount: "80", payment: "entreprise" }, null, NOW);
    const mine = await listExpenses(worker, { month: "2026-10", team: true });
    expect(mine).toHaveLength(3);
    // Les autres ne voient pas ses justificatifs.
    const other = await signUp(db, "autre@exemple.fr");
    await expect(expensePhoto(other, id)).rejects.toMatchObject({ status: 404 });
  });

  it("validation, refus, chantier et remboursement", async () => {
    await expect(reviewExpenses(worker, [], "valide")).rejects.toMatchObject({ status: 403 });
    const pending = await pendingExpenses(boss);
    expect(pending).toHaveLength(3);
    const repas = pending.find((e) => e.category === "repas")!;
    const fournitures = pending.find((e) => e.category === "fournitures")!;
    const carburant = pending.find((e) => e.category === "carburant")!;
    await expect(reviewExpenses(boss, [carburant.id], "refuse")).rejects.toMatchObject({ status: 400 });
    await reviewExpenses(boss, [carburant.id], "refuse", "Plein du véhicule personnel");
    expect(await reviewExpenses(boss, [repas.id, fournitures.id], "valide")).toEqual({ updated: 2 });
    // La dépense validée du chantier s'ajoute à ses achats, en HT.
    let purchases = await listPurchases(boss, jobId);
    expect(purchases.map((p) => [p.amount_ht_cents, p.category, p.supplier])).toEqual([[3000, "materiau", "Point P"]]);
    // Rouvrir la note retire l'achat.
    await reviewExpenses(boss, [fournitures.id], "soumis");
    expect(await listPurchases(boss, jobId)).toEqual([]);
    await reviewExpenses(boss, [fournitures.id], "valide");
    purchases = await listPurchases(boss, jobId);
    expect(purchases).toHaveLength(1);

    const totals = expenseTotals(await listExpenses(boss, { month: "2026-10", team: true }));
    expect(totals).toHaveLength(1);
    expect(totals[0]).toMatchObject({ totalCents: 5450, validatedCents: 5450, toReimburseCents: 5450 });
    expect(await reviewExpenses(boss, [repas.id, fournitures.id, carburant.id], "rembourse")).toEqual({ updated: 2 });
    expect(expenseTotals(await listExpenses(boss, { month: "2026-10", team: true }))[0]).toMatchObject({
      toReimburseCents: 0,
      reimbursedCents: 5450,
    });
    await expect(deleteExpense(worker, repas.id)).rejects.toMatchObject({ status: 409 });
    await deleteExpense(worker, carburant.id);
  });

  it("export du mois pour la comptabilité", async () => {
    await expect(expensesCsv(worker, "2026-10")).rejects.toMatchObject({ status: 403 });
    const csv = await expensesCsv(boss, "2026-10");
    expect(csv).toContain("montant_ttc");
    expect(csv).toContain("Brasserie du Port");
    expect(csv).toContain("18,50");
    expect(csv).toContain("16,82");
  });
});
