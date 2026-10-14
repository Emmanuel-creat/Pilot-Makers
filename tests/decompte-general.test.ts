import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { computeFinalAccount } from "@/lib/final-account";
import type { Ctx } from "@/lib/services/context";
import { getFinalAccount, savePenalties, setFinalAccountStatus } from "@/lib/services/final-account";
import { createDepositInvoice, createFinalInvoice, recordPayment } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, parisDate, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("calcul du décompte", () => {
  it("compte les acomptes une seule fois et déduit retenue, pénalités et règlements", () => {
    const a = computeFinalAccount({
      marketHtCents: 100000,
      marketTtcCents: 120000,
      amendments: [{ label: "Avenant n° 1", htCents: 10000, ttcCents: 12000 }],
      invoices: [
        { number: "FA-1", kind: "deposit", issueDate: "2026-09-01", ttcCents: 36000, amountDueCents: 36000, retentionCents: 0, paidCents: 36000 },
        // Solde : TTC complet, acompte déduit, retenue de 5 % sur le TTC
        {
          number: "FA-2",
          kind: "final",
          issueDate: "2026-10-01",
          ttcCents: 132000,
          amountDueCents: 132000 - 36000 - 6600,
          retentionCents: 6600,
          paidCents: 50000,
        },
        { number: "AV-1", kind: "credit_note", issueDate: "2026-10-05", ttcCents: 1200, amountDueCents: 0, retentionCents: 0, paidCents: 0 },
      ],
      penaltiesCents: 1000,
    });
    expect(a).toEqual({
      contractHtCents: 110000,
      contractTtcCents: 132000,
      invoicedTtcCents: 130800,
      gapTtcCents: -1200,
      retentionCents: 6600,
      penaltiesCents: 1000,
      paidCents: 86000,
      balanceCents: 130800 - 6600 - 1000 - 86000,
      hasFinalInvoice: true,
    });
  });
});

describe("décompte d'un devis accepté", () => {
  let db: Database;
  let ctx: Ctx;
  let id: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "decompte@exemple.fr");
    await completeProfile(ctx);
    id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Salle d'eau",
        site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" },
        sections: [{ ...d.sections[0], lines: [line()] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  });

  it("prépare, fige à l'envoi puis note la réponse du client", async () => {
    const dep = await createDepositInvoice(ctx, id, { percent: "30" });
    await recordPayment(ctx, dep.id, { amount: "297", paidOn: parisDate(new Date()), method: "virement", reference: "" });
    await expect(setFinalAccountStatus(ctx, id, "envoye")).rejects.toMatchObject({ status: 409 });
    await createFinalInvoice(ctx, id);
    let v = await getFinalAccount(ctx, id);
    expect(v.status).toBe("projet");
    expect(v.invoices.map((i) => i.kind)).toEqual(["deposit", "final"]);
    expect(v.account.invoicedTtcCents).toBe(v.account.contractTtcCents);
    expect(v.account.paidCents).toBe(29700);
    await expect(savePenalties(ctx, id, "150", "")).rejects.toMatchObject({ status: 400 });
    await savePenalties(ctx, id, "150", "Retard de 3 jours");
    v = await getFinalAccount(ctx, id);
    expect(v.account.balanceCents).toBe(v.account.contractTtcCents - 29700 - 15000);

    await setFinalAccountStatus(ctx, id, "envoye");
    await savePenalties(ctx, id, "0", "").catch((e) => expect(e.status).toBe(409));
    await expect(setFinalAccountStatus(ctx, id, "conteste")).rejects.toMatchObject({ status: 400 });
    await setFinalAccountStatus(ctx, id, "accepte");
    v = await getFinalAccount(ctx, id);
    expect(v).toMatchObject({ status: "accepte", frozen: true });
    expect(v.account.penaltiesCents).toBe(15000);
    await expect(setFinalAccountStatus(ctx, id, "projet")).rejects.toMatchObject({ status: 409 });

    const worker = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(getFinalAccount(worker, id)).rejects.toMatchObject({ status: 403 });
  });
});
