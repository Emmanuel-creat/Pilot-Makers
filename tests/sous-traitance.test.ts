import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { createSession } from "@/lib/services/accounts";
import { retentionBp, retentionCents } from "@/lib/services/btp";
import type { Ctx } from "@/lib/services/context";
import { createCreditNote, createFinalInvoice, getInvoice } from "@/lib/services/invoices";
import { createQuote, getDraft, getVersion, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { securityTxt } from "@/lib/security-contact";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const pro = { type: "entreprise", company_name: "Bâti Général SAS", siren: "732829320", vat_number: "FR44732829320" };

async function quoteFor(customerId: string, extra: Record<string, unknown>) {
  const id = await createQuote(ctx, { customerId });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Carrelage du lot 3",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      paymentTerms: "Solde à 30 jours.",
      sections: [{ id: d.sections[0].id, title: "", description: "", lines: [line()] }],
      ...extra,
    },
    d.draftRevision,
  );
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "sous-traitant@exemple.fr");
  await completeProfile(ctx);
});

describe("sous-traitance du bâtiment", () => {
  it("lit le taux de retenue de garantie et le plafonne à 5 %", () => {
    expect(retentionBp("")).toBe(0);
    expect(retentionBp("5")).toBe(500);
    expect(retentionBp("2,5 %")).toBe(250);
    expect(retentionBp("6")).toBeNull();
    expect(retentionBp("abc")).toBeNull();
    expect(retentionCents(99000, 500)).toBe(4950);
  });

  it("établit le devis hors TVA avec la mention d'autoliquidation et la retenue de garantie", async () => {
    const id = await quoteFor(await makeCustomer(ctx, pro), { reverseCharge: true, retentionPercent: "5" });
    const d = await getDraft(ctx, id);
    expect(d.reverseCharge).toBe(true);
    expect(d.retentionPercent).toBe("5");
    await issueQuote(ctx, id);
    const v = await getVersion(db, ctx.orgId, id, 1);
    expect(v.snapshot.calc.totalTtcCents).toBe(v.snapshot.calc.totalHtCents);
    const mentions = v.snapshot.mentions.join(" ");
    expect(mentions).toContain("Autoliquidation");
    expect(mentions).toContain("283-2 nonies");
    expect(mentions).toContain("Retenue de garantie de 5 %");

    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    const fin = await createFinalInvoice(ctx, id);
    const f = await getInvoice(ctx, fin.id);
    expect(f.total_ttc_cents).toBe(90000);
    expect(f.snapshot.invoice.retention).toEqual({ bp: 500, cents: 4500 });
    expect(f.amount_due_cents).toBe(90000 - 4500);
    expect(f.snapshot.mentions.join(" ")).toContain("Autoliquidation");

    // L'avoir total annule exactement le montant facturé, retenue comprise.
    const av = await createCreditNote(ctx, fin.id, { mode: "full", reason: "Erreur de lot" });
    expect((await getInvoice(ctx, av.id)).amount_due_cents).toBe(90000 - 4500);
    expect((await getInvoice(ctx, fin.id)).credited_cents).toBe(90000 - 4500);
  });

  it("refuse l'autoliquidation pour un client particulier et une retenue au-delà de 5 %", async () => {
    const id = await quoteFor(await makeCustomer(ctx), { reverseCharge: true });
    await expect(issueQuote(ctx, id)).rejects.toMatchObject({ status: 422 });
    const id2 = await createQuote(ctx, { customerId: await makeCustomer(ctx, pro) });
    const d = await getDraft(ctx, id2);
    await expect(saveDraft(ctx, id2, { ...d, retentionPercent: "10" }, d.draftRevision)).rejects.toMatchObject({ status: 400 });
  });
});

describe("sécurité des connexions", () => {
  it("prévient par e-mail d'une connexion depuis un appareil jamais vu, pas d'une reconnexion", async () => {
    const count = async () =>
      Number((await db.query<{ n: unknown }>("SELECT count(*) AS n FROM emails WHERE kind='new_device' AND to_address=$1", [ctx.email]))[0].n);
    const firefox = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";
    const before = await count();
    await createSession(db, ctx.userId, { ip: "203.0.113.9", userAgent: firefox });
    expect(await count()).toBe(before + 1);
    await createSession(db, ctx.userId, { ip: "203.0.113.9", userAgent: firefox.replace("131.0", "132.0") });
    expect(await count()).toBe(before + 1);
  });

  it("publie un security.txt valable un an", () => {
    process.env.SECURITY_EMAIL = "securite@exemple.fr";
    const txt = securityTxt("https://pilot.exemple.fr", new Date("2026-10-12T00:00:00Z"));
    expect(txt).toContain("Contact: mailto:securite@exemple.fr");
    expect(txt).toContain("Expires: 2027-10-12");
    expect(txt).toContain("Policy: https://pilot.exemple.fr/securite");
    delete process.env.SECURITY_EMAIL;
  });
});
