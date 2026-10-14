import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { fiscalMonths, monthChecks, monthLabel, monthState, yearProgress } from "@/lib/continuous-accounting";
import { continuousAccounting, reopenMonth, verifyMonth } from "@/lib/services/continuous-accounting";
import type { Ctx } from "@/lib/services/context";
import { freshDb, signUp } from "./helpers";

describe("règles de la comptabilité au fil de l'eau", () => {
  it("mois de l'exercice et libellés", () => {
    expect(fiscalMonths("2026-01-01", "2026-12-31")).toHaveLength(12);
    expect(fiscalMonths("2025-07-01", "2026-06-30")[0]).toBe("2025-07");
    expect(fiscalMonths("2025-07-01", "2026-06-30").at(-1)).toBe("2026-06");
    expect(monthLabel("2026-08")).toBe("août 2026");
  });

  it("contrôles et état d'un mois", () => {
    const ok = monthChecks({ bankLines: 12, unmatched: 0, pendingExpenses: 0, missingReceipts: 0 });
    expect(ok.every((c) => c.ok)).toBe(true);
    const ko = monthChecks({ bankLines: 0, unmatched: 0, pendingExpenses: 2, missingReceipts: 1 });
    expect(ko.filter((c) => !c.ok).map((c) => [c.id, c.count])).toEqual([
      ["releve", 1],
      ["frais", 2],
      ["justificatifs", 1],
    ]);
    expect(monthState("2026-11", "2026-10-14", ok, null)).toBe("a_venir");
    expect(monthState("2026-10", "2026-10-14", ok, null)).toBe("en_cours");
    expect(monthState("2026-09", "2026-10-14", ok, null)).toBe("pret");
    expect(monthState("2026-09", "2026-10-14", ko, null)).toBe("a_corriger");
    expect(monthState("2026-09", "2026-10-14", ko, { verifiedAt: new Date(), vatDeclared: true, note: "" })).toBe("verifie");
  });

  it("la clôture tient en un jour quand chaque mois est vérifié", () => {
    expect(yearProgress(["verifie", "pret", "a_corriger", "en_cours", "a_venir"])).toEqual({ verified: 1, elapsed: 3, late: 2, oneDayClose: false });
    expect(yearProgress(Array(12).fill("verifie"))).toMatchObject({ verified: 12, oneDayClose: true });
  });
});

describe("vérification des mois", () => {
  let db: Database;
  let ctx: Ctx;
  const now = new Date("2026-10-14T10:00:00Z");
  let n = 0;
  const bank = (date: string, status = "rapproche") =>
    db.query("INSERT INTO bank_transactions (org_id, booked_on, amount_cents, label, fingerprint, status) VALUES ($1,$2,1000,'Virement',$3,$4)", [
      ctx.orgId,
      date,
      `fp-${n++}`,
      status,
    ]);
  const expense = (date: string, status: string, photo: boolean) =>
    db.query(
      "INSERT INTO expenses (org_id, user_id, expense_date, category, amount_ttc_cents, status, photo, photo_type) VALUES ($1,$2,$3,'repas',1800,$4,$5,$6)",
      [ctx.orgId, ctx.userId, date, status, photo ? Buffer.from("x") : null, photo ? "image/jpeg" : null],
    );

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "compta-continue@exemple.fr");
    await bank("2026-08-05");
    await bank("2026-08-20");
    await expense("2026-08-12", "valide", true);
    await bank("2026-09-03");
    await bank("2026-09-18", "a_rapprocher");
    await expense("2026-09-10", "soumis", false);
    await expense("2026-09-11", "refuse", false);
  });

  it("tableau de l'exercice avec les anomalies de chaque mois", async () => {
    const r = await continuousAccounting(ctx, 2026, now);
    const by = Object.fromEntries(r.months.map((m) => [m.month, m]));
    expect(by["2026-08"].state).toBe("pret");
    expect(by["2026-09"].state).toBe("a_corriger");
    expect(by["2026-09"].checks.filter((c) => !c.ok).map((c) => [c.id, c.count])).toEqual([
      ["rapprochement", 1],
      ["frais", 1],
      ["justificatifs", 1],
    ]);
    expect(by["2026-07"].checks.find((c) => c.id === "releve")!.ok).toBe(false);
    expect(by["2026-10"].state).toBe("en_cours");
    expect(by["2026-12"].state).toBe("a_venir");
    expect(r.progress).toMatchObject({ verified: 0, elapsed: 9, late: 9, oneDayClose: false });
  });

  it("vérifie un mois sans anomalie, refuse les autres et le mois en cours", async () => {
    await verifyMonth(ctx, "2026-08", { vatDeclared: true, note: "Relevé de la banque populaire" }, now);
    await expect(verifyMonth(ctx, "2026-09", { vatDeclared: false, note: "" }, now)).rejects.toThrow(/rapprochez.*validez.*photo/);
    await expect(verifyMonth(ctx, "2026-10", { vatDeclared: false, note: "" }, now)).rejects.toThrow(/terminé/);
    await expect(verifyMonth(ctx, "2026-13", { vatDeclared: false, note: "" }, now)).rejects.toThrow(/invalide/);
    let r = await continuousAccounting(ctx, 2026, now);
    expect(r.months.find((m) => m.month === "2026-08")).toMatchObject({
      state: "verifie",
      review: { vatDeclared: true, note: "Relevé de la banque populaire" },
    });
    expect(r.progress.verified).toBe(1);
    await reopenMonth(ctx, "2026-08");
    r = await continuousAccounting(ctx, 2026, now);
    expect(r.months.find((m) => m.month === "2026-08")!.state).toBe("pret");
  });
});
