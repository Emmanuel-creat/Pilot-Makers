import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { listPurchases } from "@/lib/services/job-costs";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { addRental, deleteRental, listJobRentals, openRentals, returnRental } from "@/lib/services/rentals";
import { billedUntil, rentalCost, rentalState, rentalsTotal, type Rental } from "@/lib/rentals";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const rental = (o: Partial<Rental> = {}): Rental => ({
  id: "r",
  equipment: "Mini-pelle 2,5 t",
  renter: "Loxam",
  startDate: "2026-10-05",
  endDate: "2026-10-09",
  returnedOn: null,
  rateCents: 15000,
  period: "jour",
  deliveryCents: 8000,
  insuranceBp: 1000,
  reference: "",
  ...o,
});

describe("coût d'une location", () => {
  it("suit l'état et la date facturée", () => {
    expect(rentalState(rental(), "2026-10-01")).toBe("a_venir");
    expect(rentalState(rental(), "2026-10-07")).toBe("en_cours");
    expect(rentalState(rental(), "2026-10-12")).toBe("en_retard");
    expect(rentalState(rental({ returnedOn: "2026-10-08" }), "2026-10-12")).toBe("rendu");
    expect(billedUntil(rental(), "2026-10-07")).toBe("2026-10-09");
    expect(billedUntil(rental(), "2026-10-12")).toBe("2026-10-12");
  });

  it("compte jours, assurance, transport et supplément de retard", () => {
    expect(rentalCost(rental(), "2026-10-07")).toEqual({ days: 5, periods: 5, rentCents: 75000, insuranceCents: 7500, totalCents: 90500, overrunCents: 0 });
    const late = rentalCost(rental(), "2026-10-11");
    expect(late).toMatchObject({ days: 7, totalCents: 123500, overrunCents: 33000 });
    // À la semaine, une semaine entamée est due
    expect(rentalCost(rental({ period: "semaine", rateCents: 60000, insuranceBp: 0, deliveryCents: 0, endDate: "2026-10-14" }), "2026-10-07")).toMatchObject({
      days: 10,
      periods: 2,
      totalCents: 120000,
    });
    expect(rentalsTotal([rental(), rental({ returnedOn: "2026-10-06" })], "2026-10-11")).toEqual({ totalCents: 123500 + 41000, overrunCents: 33000, late: 1 });
  });
});

describe("location pour un chantier", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;
  const NOW = new Date("2026-10-14T10:00:00Z");

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "location@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, title: "Terrasse", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    jobId = await createJobFromQuote(ctx, id);
  });

  it("enregistre une location et la suit tant qu'elle n'est pas rendue", async () => {
    const base = {
      equipment: "Mini-pelle 2,5 t",
      renter: "Loxam",
      startDate: "2026-10-05",
      endDate: "2026-10-09",
      rate: "150",
      period: "jour",
      delivery: "80",
      insurance: "10",
    };
    await expect(addRental(ctx, jobId, { ...base, endDate: "2026-10-01" })).rejects.toMatchObject({ status: 400 });
    await expect(addRental(ctx, jobId, { ...base, insurance: "80" })).rejects.toMatchObject({ status: 400 });
    await expect(addRental(ctx, jobId, { ...base, rate: "abc" })).rejects.toMatchObject({ status: 400 });
    await addRental(ctx, jobId, base);
    await addRental(ctx, jobId, { ...base, equipment: "Bétonnière", rate: "", period: "jour" }).catch((e) => expect(e.status).toBe(400));
    const open = await openRentals(ctx, NOW);
    expect(open.map((r) => [r.equipment, r.state, r.cost.totalCents, r.cost.overrunCents])).toEqual([["Mini-pelle 2,5 t", "en_retard", 173000, 82500]]);
  });

  it("au retour, reporte le coût réel sur le chantier", async () => {
    const [r] = await listJobRentals(ctx, jobId);
    await expect(returnRental(ctx, r.id, "2026-10-20", NOW)).rejects.toMatchObject({ status: 400 });
    await expect(returnRental(ctx, r.id, "2026-10-01", NOW)).rejects.toMatchObject({ status: 400 });
    const res = await returnRental(ctx, r.id, "2026-10-10", NOW);
    expect(res.cost).toMatchObject({ days: 6, totalCents: 107000, overrunCents: 16500 });
    await expect(returnRental(ctx, r.id, "2026-10-10", NOW)).rejects.toMatchObject({ status: 400 });
    const purchases = await listPurchases(ctx, jobId);
    expect(purchases.map((p) => [p.label, p.category, p.amount_ht_cents, p.supplier])).toEqual([
      ["Location : Mini-pelle 2,5 t (6 jours)", "location", 107000, "Loxam"],
    ]);
    expect(await openRentals(ctx, NOW)).toEqual([]);
    await expect(deleteRental(ctx, r.id)).rejects.toMatchObject({ status: 400 });
    const other = await signUp(db, "location-autre@exemple.fr", "Autre");
    await expect(returnRental(other, r.id, "2026-10-10", NOW)).rejects.toMatchObject({ status: 404 });
    await expect(
      addRental(other, jobId, { equipment: "Nacelle", startDate: "2026-10-05", endDate: "2026-10-06", rate: "100", period: "jour" }),
    ).rejects.toMatchObject({
      status: 404,
    });
  });
});
