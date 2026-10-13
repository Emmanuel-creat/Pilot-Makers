import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { DEFAULT_PLAN, getPlan, readPlan, savePlan, ventilate } from "@/lib/services/accounting-plan";
import { can, isReadOnlyMember, type Ctx } from "@/lib/services/context";
import { buildFec } from "@/lib/services/fec";
import { vatReturn } from "@/lib/services/finance";
import { createFinalInvoice } from "@/lib/services/invoices";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { acceptInvite, inviteMember, listMembers } from "@/lib/services/team";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

const PLAN = {
  customers: "411",
  sales: "70610000",
  goods: "70710000",
  subcontracting: "70620000",
  travel: "70850000",
  deposits: "4191",
  bank: "5121",
  vat2000: "44571200",
  vat1000: "44571100",
  vat550: "44571055",
  vat210: "44571021",
  auxPrefix: "cl",
  ventilate: true,
};

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "compta@exemple.fr");
  await completeProfile(ctx);
});

describe("plan comptable et espace expert-comptable", () => {
  it("répartit un montant au centime près", () => {
    const parts = ventilate(
      1000,
      new Map([
        ["a", 1],
        ["b", 1],
        ["c", 1],
      ]),
    );
    expect([...parts.values()].reduce((s, v) => s + v, 0)).toBe(1000);
    expect(ventilate(10, new Map([["a", 0]])).size).toBe(0);
    expect(readPlan({ sales: "abc", ventilate: "oui" })).toEqual(DEFAULT_PLAN);
  });

  it("valide et enregistre les comptes du cabinet", async () => {
    expect(await getPlan(ctx)).toEqual(DEFAULT_PLAN);
    await expect(savePlan(ctx, { ...PLAN, sales: "VENTES" })).rejects.toMatchObject({ status: 400 });
    const saved = await savePlan(ctx, PLAN);
    expect(saved).toMatchObject({ customers: "411", auxPrefix: "CL", ventilate: true });
    expect((await getPlan(ctx)).vat[2000]).toBe("44571200");
  });

  it("produit le FEC avec ces comptes et le chiffre d'affaires ventilé", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Salle de bain",
        site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
        paymentTerms: "Solde à réception.",
        sections: [
          {
            ...d.sections[0],
            lines: [line(), line({ label: "Meuble vasque", nature: "materiau", quantity: "1", unit: "u", unitPrice: "500", vatPercent: "20" })],
          },
        ],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Devis signé" });
    const inv = await createFinalInvoice(ctx, id);
    const year = new Date().getFullYear();
    const fec = await buildFec(ctx, `${year - 1}-01-01`, `${year + 1}-12-31`);
    const rows = fec.content
      .split("\r\n")
      .filter(Boolean)
      .slice(1)
      .map((l) => l.split("\t"))
      .filter((r) => r[8] === inv.number);
    const credit = (acc: string) => rows.find((r) => r[4] === acc)?.[12];
    expect(credit("70610000")).toBe("900,00");
    expect(credit("70710000")).toBe("500,00");
    expect(credit("44571100")).toBe("90,00");
    expect(credit("44571200")).toBe("100,00");
    expect(rows.find((r) => r[4] === "411")?.[6]).toMatch(/^CL/);
  });

  it("donne au cabinet un accès en lecture, hors utilisateurs de l'offre", async () => {
    const { token } = await inviteMember(ctx, { email: "cabinet@exemple.fr", jobFunction: "comptable" });
    const a = await signUp(db, "cabinet@exemple.fr", "Cabinet Durand");
    await acceptInvite(a, token);
    const member = (await listMembers(ctx)).find((m) => m.email === "cabinet@exemple.fr")!;
    expect(member).toMatchObject({ role: "member", job_function: "comptable" });
    const accountant = { ...a, orgId: ctx.orgId, role: "member", jobFunction: "comptable" } as Ctx;
    expect(isReadOnlyMember(accountant)).toBe(true);
    expect(can(accountant, "billing")).toBe(true);
    expect(can(accountant, "costs")).toBe(false);
    expect((await vatReturn(accountant, "2026-01-01", "2026-12-31")).franchise).toBe(false);
    expect((await buildFec(accountant, "2026-01-01", "2026-12-31")).count).toBeGreaterThanOrEqual(0);
    await expect(createQuote(accountant, { customerId: null })).rejects.toMatchObject({ status: 403 });
    await expect(savePlan(accountant, PLAN)).rejects.toMatchObject({ status: 403 });
  });
});
