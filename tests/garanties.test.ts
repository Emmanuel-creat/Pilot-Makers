import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createCreditNote, createFinalInvoice } from "@/lib/services/invoices";
import { signReception } from "@/lib/services/job-site";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { getWarranty, listWarranties, releaseRetention, runWarrantyReminders } from "@/lib/services/warranties";
import { addYears, dueReminders, retentionState, warrantyPeriods } from "@/lib/warranties";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const pro = { type: "entreprise", company_name: "Bâti Général SAS", siren: "732829320", vat_number: "FR44732829320" };

async function receivedJob(date: string, retentionPercent = "5") {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx, pro) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Carrelage du hall",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      retentionPercent,
      sections: [{ ...d.sections[0], lines: [line()] }],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  const jobId = await createJobFromQuote(ctx, id);
  const fin = await createFinalInvoice(ctx, id);
  await signReception(ctx, jobId, {
    date,
    decision: "avec_reserves",
    reserves: [{ label: "Joint à reprendre", location: "Hall" }],
    clientName: "Claire Dubois",
    clientSignature: PNG,
    companyName: "Paul Martin",
    companySignature: PNG,
  });
  return { jobId, quoteId: id, invoiceId: fin.id };
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "garanties@exemple.fr");
  await completeProfile(ctx);
});

describe("échéances des garanties", () => {
  it("calcule un, deux et dix ans après la réception, 29 février compris", () => {
    expect(addYears("2026-03-15", 1)).toBe("2027-03-15");
    expect(addYears("2028-02-29", 1)).toBe("2029-02-28");
    expect(addYears("2028-02-29", 4)).toBe("2032-02-29");
    const p = warrantyPeriods("2026-01-10", "2026-12-01");
    expect(p.map((x) => [x.key, x.end, x.state])).toEqual([
      ["parfait", "2027-01-10", "bientot"],
      ["biennale", "2028-01-10", "en_cours"],
      ["decennale", "2036-01-10", "en_cours"],
    ]);
    expect(warrantyPeriods("2020-01-10", "2026-12-01")[1].state).toBe("terminee");
  });

  it("retenue retenue, à libérer puis libérée, et rappels envoyés une seule fois", () => {
    const base = { cents: 4500, releasedAt: null, receptionDate: "2026-01-10" };
    expect(retentionState({ ...base, cents: 0, today: "2027-02-01" })).toBe("aucune");
    expect(retentionState({ ...base, today: "2027-01-09" })).toBe("retenue");
    expect(retentionState({ ...base, today: "2027-01-10" })).toBe("liberable");
    expect(retentionState({ ...base, releasedAt: "2027-01-12T10:00:00Z", today: "2027-02-01" })).toBe("liberee");
    const r = { receptionDate: "2026-01-10", retentionCents: 4500, releasedAt: null };
    expect(dueReminders({ ...r, today: "2026-11-01" }, [])).toEqual([]);
    expect(dueReminders({ ...r, today: "2026-12-20" }, [])).toEqual(["parfait_fin"]);
    expect(dueReminders({ ...r, today: "2026-12-20" }, ["parfait_fin"])).toEqual([]);
    expect(dueReminders({ ...r, today: "2027-01-10" }, ["parfait_fin"])).toEqual(["retenue_liberable"]);
    expect(dueReminders({ ...r, retentionCents: 0, today: "2027-01-10" }, ["parfait_fin"])).toEqual([]);
  });
});

describe("suivi des chantiers réceptionnés", () => {
  it("reprend la retenue des factures, la libère et prévient l'entreprise", async () => {
    const { jobId } = await receivedJob("2025-10-01");
    const w = await getWarranty(ctx, jobId, new Date("2026-10-13T10:00:00Z"));
    expect(w).toMatchObject({ openReserves: 1, receptionDate: "2025-10-01" });
    expect(w!.retention).toMatchObject({ state: "liberable", releaseDate: "2026-10-01" });
    expect(w!.retention.cents).toBeGreaterThan(0);

    const first = await runWarrantyReminders(db, new Date("2026-10-13T10:00:00Z"));
    expect(first.sent).toBeGreaterThanOrEqual(1);
    const row = await db.query<{ reminders_sent: string[] }>("SELECT reminders_sent FROM job_receptions WHERE job_id=$1", [jobId]);
    expect(row[0].reminders_sent).toContain("retenue_liberable");
    expect((await runWarrantyReminders(db, new Date("2026-10-14T10:00:00Z"))).sent).toBe(0);

    await releaseRetention(ctx, jobId, "Virement reçu");
    const after = await getWarranty(ctx, jobId);
    expect(after!.retention).toMatchObject({ state: "liberee", note: "Virement reçu" });
    await expect(releaseRetention(ctx, jobId, "")).rejects.toMatchObject({ status: 409 });
    expect((await listWarranties(ctx)).some((x) => x.jobId === jobId)).toBe(true);

    const stranger = await signUp(db, "garanties-autre@exemple.fr", "Autre");
    await expect(releaseRetention(stranger, jobId, "")).rejects.toMatchObject({ status: 404 });
  });

  it("un avoir total annule la retenue, un devis sans retenue n'a rien à libérer", async () => {
    const credited = await receivedJob("2026-09-01");
    await createCreditNote(ctx, credited.invoiceId, { mode: "full", reason: "Erreur de lot" });
    expect((await getWarranty(ctx, credited.jobId))!.retention.state).toBe("aucune");
    const none = await receivedJob("2026-09-02", "");
    expect((await getWarranty(ctx, none.jobId))!.retention).toMatchObject({ cents: 0, state: "aucune" });
    await expect(releaseRetention(ctx, none.jobId, "")).rejects.toMatchObject({ status: 400 });
  });
});
