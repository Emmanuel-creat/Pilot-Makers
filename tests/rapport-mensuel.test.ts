import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { buildMonthlyReport, monthName, previousMonth, signatureRate, trend, type MonthFigures } from "@/lib/monthly-report";
import { createFinalInvoice } from "@/lib/services/invoices";
import { getMonthlyReportSetting, monthlyReportData, runMonthlyReports, setMonthlyReport } from "@/lib/services/monthly-report";
import { createQuote, getDraft, issueQuote, parisDate, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const fig = (o: Partial<MonthFigures>): MonthFigures => ({
  month: "2026-10",
  sent: 0,
  signed: 0,
  refused: 0,
  signedHtCents: 0,
  invoicedHtCents: 0,
  collectedCents: 0,
  ...o,
});

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "rapport-mensuel@exemple.fr");
  await completeProfile(ctx);
});

describe("contenu du rapport", () => {
  it("nomme le mois et compare", () => {
    expect(previousMonth("2026-01-03")).toBe("2025-12");
    expect(previousMonth("2026-11-02")).toBe("2026-10");
    expect(monthName("2026-10")).toBe("octobre 2026");
    expect(trend(112, 100)).toBe("en hausse de 12 %");
    expect(trend(95, 100)).toBe("en baisse de 5 %");
    expect(trend(101, 100)).toBe("stable");
    expect(trend(50, 0)).toBe("");
    expect(signatureRate({ signed: 3, refused: 1 })).toBe(75);
    expect(signatureRate({ signed: 0, refused: 0 })).toBeNull();
  });

  it("rédige l'e-mail avec comparaisons, objectif et retards", () => {
    const m = buildMonthlyReport({
      orgName: "Martin Rénovation",
      current: fig({ sent: 10, signed: 3, refused: 1, signedHtCents: 2400000, invoicedHtCents: 1800000, collectedCents: 1500000 }),
      previous: fig({ month: "2026-09", signedHtCents: 2000000, invoicedHtCents: 1800000, collectedCents: 0 }),
      lastYear: null,
      goalSignedHtCents: 3000000,
      pendingQuotesTtcCents: 450000,
      overdue: { count: 2, cents: 320000 },
      activeJobs: 4,
      appUrl: "https://exemple.fr/app/rapports",
    });
    expect(m.subject).toBe("Votre mois de octobre 2026 : 24 000 € HT signés");
    expect(m.lines[0]).toBe("Devis signés : 3 pour 24 000 € HT (en hausse de 20 % sur un mois).");
    expect(m.lines).toContain("Objectif du mois : 30 000 € HT, atteint à 80 %.");
    expect(m.lines).toContain("Devis envoyés : 10, taux de signature 75 %.");
    expect(m.lines).toContain("Facturé : 18 000 € HT (stable sur un mois).");
    expect(m.lines).toContain("Encaissé : 15 000 €.");
    expect(m.lines).toContain("Factures en retard : 2, pour 3 200 € restant dus.");
    expect(m.body).toContain("Voici l'essentiel de octobre 2026 pour Martin Rénovation :");
    expect(m.body).toContain("https://exemple.fr/app/rapports");
  });
});

describe("envoi au gérant", () => {
  it("envoie une fois par mois la première semaine, sauf si désactivé", async () => {
    const qid = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, qid);
    await saveDraft(ctx, qid, { ...d, title: "Salle de bains", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
    await issueQuote(ctx, qid);
    await recordResponseManually(ctx, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    await createFinalInvoice(ctx, qid);

    const today = parisDate(new Date());
    const [y, m] = today.split("-").map(Number);
    const next = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 2, 9));
    const data = await monthlyReportData(db, ctx.orgId, next);
    expect(data.current.month).toBe(today.slice(0, 7));
    expect(data.current.signed).toBe(1);
    expect(data.current.invoicedHtCents).toBeGreaterThan(0);

    expect(await getMonthlyReportSetting(ctx)).toBe(true);
    expect((await runMonthlyReports(db, new Date(next.getTime() + 8 * 86400000))).sent).toBe(0);
    expect((await runMonthlyReports(db, next)).sent).toBe(1);
    expect((await runMonthlyReports(db, next)).sent).toBe(0);
    const mails = await db.query<{ subject: string; to_address: string }>("SELECT subject, to_address FROM emails WHERE kind='monthly_report'");
    expect(mails).toHaveLength(1);
    expect(mails[0].to_address).toBe("rapport-mensuel@exemple.fr");

    await setMonthlyReport(ctx, false);
    expect(await getMonthlyReportSetting(ctx)).toBe(false);
    const later = new Date(Date.UTC(next.getUTCMonth() === 11 ? next.getUTCFullYear() + 1 : next.getUTCFullYear(), (next.getUTCMonth() + 1) % 12, 2, 9));
    expect((await runMonthlyReports(db, later)).sent).toBe(0);
  });
});
