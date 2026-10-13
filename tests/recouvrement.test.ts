import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { getRecovery, setFormalNotice } from "@/lib/services/recovery";
import { addYears, claim, formalNotice, injunctionFile, latePenalty, rateFromText, recoveryStage } from "@/lib/recovery";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const pro = { type: "entreprise", company_name: "Bâti Général SAS", siren: "732829320", vat_number: "FR44732829320" };

async function overdueInvoice(customer: Record<string, string> = pro) {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx, customer) });
  const d = await getDraft(ctx, id);
  await saveDraft(ctx, id, { ...d, title: "Carrelage du hall", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  await issueQuote(ctx, id);
  await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  const inv = await createFinalInvoice(ctx, id);
  // Facture archivée : les dates ne se changent qu'en levant la protection, comme pour une purge.
  await db.query("SELECT set_config('pilot.purge', 'on', false)");
  await db.query("UPDATE invoices SET issue_date='2026-01-02', due_date='2026-02-01', reminder_count=2 WHERE id=$1", [inv.id]);
  await db.query("SELECT set_config('pilot.purge', 'off', false)");
  return inv.id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "recouvrement@exemple.fr");
  await completeProfile(ctx);
});

describe("calculs du recouvrement", () => {
  it("passe des relances à la mise en demeure, puis à l'injonction après le délai", () => {
    const base = { balanceCents: 100000, dueDate: "2026-02-01", reminders: 0, noticeSentOn: null };
    expect(recoveryStage({ ...base, today: "2026-01-20" })).toBe("a_jour");
    expect(recoveryStage({ ...base, balanceCents: 0, today: "2026-06-01" })).toBe("a_jour");
    expect(recoveryStage({ ...base, today: "2026-02-10" })).toBe("relances");
    expect(recoveryStage({ ...base, today: "2026-04-01" })).toBe("relances");
    expect(recoveryStage({ ...base, reminders: 2, today: "2026-04-01" })).toBe("mise_en_demeure");
    expect(recoveryStage({ ...base, noticeSentOn: "2026-04-01", today: "2026-04-09" })).toBe("attente_reponse");
    expect(recoveryStage({ ...base, noticeSentOn: "2026-04-01", today: "2026-04-10" })).toBe("injonction");
  });

  it("lit le taux de la mention de pénalités et calcule des intérêts simples", () => {
    expect(rateFromText("Pénalités de retard : 10 % par an.")).toBe(1000);
    expect(rateFromText("taux de 12,5% l'an")).toBe(1250);
    expect(rateFromText("trois fois le taux d'intérêt légal")).toBeNull();
    expect(latePenalty(365000, "2026-01-01", "2026-01-11", 1000)).toBe(1000);
    expect(latePenalty(365000, "2026-01-11", "2026-01-01", 1000)).toBe(0);
  });

  it("ajoute l'indemnité de 40 euros entre professionnels seulement", () => {
    const pro = claim({ balanceCents: 120000, dueDate: "2026-01-01", today: "2026-03-02", rateBp: 1000, professional: true });
    expect(pro).toMatchObject({ principalCents: 120000, flatFeeCents: 4000, days: 60 });
    expect(pro.totalCents).toBe(120000 + pro.penaltyCents + 4000);
    const part = claim({ balanceCents: 120000, dueDate: "2026-01-01", today: "2026-03-02", rateBp: null, professional: false });
    expect(part).toMatchObject({ penaltyCents: 0, flatFeeCents: 0, totalCents: 120000 });
  });

  it("rédige une mise en demeure avec le décompte", () => {
    const c = claim({ balanceCents: 120000, dueDate: "2026-01-01", today: "2026-03-02", rateBp: 1000, professional: true });
    const text = formalNotice({
      creditor: { name: "Martin Rénovation", address: ["3 rue des Lilas", "69003 Lyon"] },
      debtor: { name: "Bâti Général SAS", address: ["8 avenue Foch", "69006 Lyon"] },
      city: "Lyon",
      today: "2026-03-02",
      invoice: { kind: "facture", number: "F-2026-0007", issueDate: "2025-12-02", dueDate: "2026-01-01", totalCents: 150000 },
      claim: c,
      reminders: 2,
      professional: true,
    });
    expect(text).toContain("Lyon, le 02/03/2026");
    expect(text).toContain("mise en demeure de payer la facture n° F-2026-0007");
    expect(text).toContain("Malgré nos 2 relances");
    expect(text).toContain("sous 8 jours");
    expect(text).toContain("article L441-10");
    expect(text).toContain("au taux annuel de 10 % sur 60 jours");
    expect(text).not.toContain("\n\n\n");
  });

  it("prépare le dossier d'injonction : juridiction, prescription, pièces", () => {
    const c = claim({ balanceCents: 50000, dueDate: "2024-05-01", today: "2026-03-02", rateBp: null, professional: false });
    const f = injunctionFile({
      professional: false,
      debtorIsCompany: false,
      dueDate: "2024-05-01",
      today: "2026-03-02",
      claim: c,
      hasSignedQuote: true,
      reminders: 1,
      noticeSentOn: "2026-02-01",
      debtorAddressComplete: true,
    });
    expect(f.court).toBe("Tribunal judiciaire");
    expect(f.prescriptionDate).toBe("2026-05-01");
    expect(f.warnings.join(" ")).toContain("déposez la requête avant");
    expect(f.pieces.every((p) => p.label)).toBe(true);
    const com = injunctionFile({
      professional: true,
      debtorIsCompany: true,
      dueDate: "2026-01-01",
      today: "2026-03-02",
      claim: c,
      hasSignedQuote: false,
      reminders: 0,
      noticeSentOn: null,
      debtorAddressComplete: false,
    });
    expect(com.court).toBe("Tribunal de commerce");
    expect(com.prescriptionDate).toBe(addYears("2026-01-01", 5));
    expect(com.warnings).toHaveLength(2);
  });
});

describe("recouvrement d'une facture", () => {
  it("calcule l'étape, le décompte et la lettre d'une facture en retard", async () => {
    await db.query("UPDATE organizations SET late_penalty_text='Pénalités de retard : 10 % par an.' WHERE id=$1", [ctx.orgId]);
    const id = await overdueInvoice();
    const r = await getRecovery(ctx, id, { now: new Date("2026-04-02T10:00:00Z") });
    expect(r.stage).toBe("mise_en_demeure");
    expect(r.rateFromSettings).toBe(true);
    expect(r.claim.days).toBe(60);
    expect(r.claim.flatFeeCents).toBe(4000);
    expect(r.letter).toContain("Bâti Général SAS");
    expect(r.file.court).toBe("Tribunal de commerce");
    expect(r.file.pieces.find((p) => p.label.startsWith("Devis"))?.ok).toBe(true);

    const other = await getRecovery(ctx, id, { now: new Date("2026-04-02T10:00:00Z"), rateBp: 0 });
    expect(other.claim.penaltyCents).toBe(0);
    expect(other.rateFromSettings).toBe(false);
  });

  it("enregistre la mise en demeure puis passe à l'injonction", async () => {
    const id = await overdueInvoice({ type: "particulier", first_name: "Claire", last_name: "Dubois" });
    await expect(setFormalNotice(ctx, id, { date: "2025-01-01", ref: "" })).rejects.toThrow(/comprise entre/);
    await setFormalNotice(ctx, id, { date: "2026-03-01", ref: "1A 234 567 8901 2" });
    const r = await getRecovery(ctx, id, { now: new Date("2026-03-20T10:00:00Z") });
    expect(r.noticeSentOn).toBe("2026-03-01");
    expect(r.noticeRef).toBe("1A 234 567 8901 2");
    expect(r.stage).toBe("injonction");
    expect(r.file.court).toBe("Tribunal judiciaire");
    expect(r.claim.flatFeeCents).toBe(0);
    await setFormalNotice(ctx, id, null);
    expect((await getRecovery(ctx, id, { now: new Date("2026-03-20T10:00:00Z") })).noticeSentOn).toBeNull();
  });
});
