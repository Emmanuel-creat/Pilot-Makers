import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { ceilingStatus, contributions, level, MICRO_RULES, splitAmount, vatStatus } from "@/lib/micro";
import type { Ctx } from "@/lib/services/context";
import { createFinalInvoice, recordPayment } from "@/lib/services/invoices";
import { materialShare, microYear } from "@/lib/services/micro";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "micro@exemple.fr");
  await completeProfile(ctx);
});

describe("micro-entreprise : règles", () => {
  it("niveaux, plafonds, seuils de TVA et cotisations", () => {
    expect(level(79, 100)).toBe("ok");
    expect(level(80, 100)).toBe("attention");
    expect(level(101, 100)).toBe("depasse");
    const i = { services: 3000000, sales: 1000000 };
    expect(ceilingStatus(i, false).services).toMatchObject({ amount: 4000000, level: "ok" });
    expect(ceilingStatus(i, false).total.level).toBe("ok");
    expect(ceilingStatus({ services: 8000000, sales: 0 }, false).services.level).toBe("attention");
    expect(ceilingStatus(i, true).services.amount).toBe(3000000);
    expect(vatStatus(i, false).services.level).toBe("attention"); // 40 000 € : entre 37 500 et 41 250
    expect(vatStatus({ services: 4200000, sales: 0 }, false).services.level).toBe("depasse");
    expect(vatStatus(i, true).services.level).toBe("attention"); // 30 000 € : plus de 80 % de 37 500
    expect(vatStatus({ services: 1000000, sales: 0 }, true).total.level).toBe("ok");
    expect(contributions(i, false)).toBe(Math.round((4000000 * MICRO_RULES.rateServicesBp) / 10000));
    expect(contributions(i, true)).toBe(Math.round((3000000 * MICRO_RULES.rateServicesBp + 1000000 * MICRO_RULES.rateSalesBp) / 10000));
    expect(splitAmount(1000, 0, 500)).toEqual({ services: 1000, sales: 0 });
    expect(splitAmount(1000, 300, 0)).toEqual({ services: 1000, sales: 0 });
    expect(splitAmount(1000, 250, 1000)).toEqual({ services: 750, sales: 250 });
  });

  it("part des matériaux d'une facture", () => {
    expect(materialShare({})).toEqual({ material: 0, total: 0 });
    expect(
      materialShare({
        sections: [{ lines: [{ id: "a", nature: "materiau" }, { id: "b", nature: "main_oeuvre" }, { id: "c", nature: "materiau" }, { id: "d" }] }],
        calc: {
          sections: [
            {
              lines: [
                { id: "a", netCents: 400 },
                { id: "b", netCents: 600 },
                { id: "c", netCents: 900, optional: true },
                { id: "d", netCents: -50 },
              ],
            },
          ],
        },
      }),
    ).toEqual({ material: 400, total: 1000 });
  });
});

describe("micro-entreprise : encaissements de l'année", () => {
  it("ventile les paiements par mois entre prestations et fournitures", async () => {
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Salle d'eau",
        site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" },
        sections: [{ ...d.sections[0], lines: [line({ unitPrice: "30" }), line({ nature: "materiau", label: "Carrelage", unitPrice: "20" })] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    const inv = await createFinalInvoice(ctx, id);
    await recordPayment(ctx, inv.id, { amount: "500", paidOn: "2026-03-10", method: "virement", reference: "" });
    await recordPayment(ctx, inv.id, { amount: "600", paidOn: "2026-05-02", method: "cheque", reference: "" });
    const r = await microYear(ctx, 2026);
    expect(r.months[2]).toEqual({ month: 3, services: 30000, sales: 20000 });
    expect(r.months[4]).toEqual({ month: 5, services: 36000, sales: 24000 });
    expect(r.total).toEqual({ services: 66000, sales: 44000 });
    expect((await microYear(ctx, 2025)).total).toEqual({ services: 0, sales: 0 });
    const worker = { ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx;
    await expect(microYear(worker, 2026)).rejects.toMatchObject({ status: 403 });
  });
});
