import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { activePercent, discounted, eligibility } from "@/lib/preferential-pricing";
import { startCheckout } from "@/lib/services/billing";
import type { Ctx } from "@/lib/services/context";
import { benefitPercent, decideBenefit, getBenefit, pendingBenefits, requestBenefit } from "@/lib/services/pricing-benefits";
import { completeProfile, freshDb, signUp } from "./helpers";

describe("règles des tarifs préférentiels", () => {
  it("apprenti : gratuit jusqu'à la fin de la formation, trois ans au plus", () => {
    const base = { kind: "apprenti" as const, school: "CFA BTP", diploma: "CAP maçon", reference: "DECA-123" };
    expect(eligibility({ ...base, trainingEnd: "2027-06-30" }, "2026-10-14")).toEqual({ ok: true, percent: 100, validUntil: "2027-06-30" });
    expect(eligibility({ ...base, trainingEnd: "2031-06-30" }, "2026-10-14")).toEqual({ ok: true, percent: 100, validUntil: "2029-10-14" });
    expect(eligibility({ ...base, trainingEnd: "2026-06-30" }, "2026-10-14")).toMatchObject({ ok: false });
  });

  it("créateur : moitié prix un an, entreprise de moins d'un an", () => {
    expect(eligibility({ kind: "createur", creationDate: "2026-03-01" }, "2026-10-14")).toEqual({ ok: true, percent: 50, validUntil: "2027-10-13" });
    expect(eligibility({ kind: "createur", creationDate: "2025-10-13" }, "2026-10-14")).toMatchObject({
      ok: false,
      reason: expect.stringContaining("plus d'un an"),
    });
    expect(eligibility({ kind: "createur", creationDate: "2026-12-01" }, "2026-10-14")).toMatchObject({ ok: false });
  });

  it("remise appliquée seulement si accordée et en cours", () => {
    expect(discounted(5900, 50)).toBe(2950);
    expect(discounted(2900, 100)).toBe(0);
    expect(activePercent({ status: "accorde", percent: 50, validUntil: "2027-01-01" }, "2026-10-14")).toBe(50);
    expect(activePercent({ status: "accorde", percent: 50, validUntil: "2026-10-13" }, "2026-10-14")).toBe(0);
    expect(activePercent({ status: "en_attente", percent: 0, validUntil: null }, "2026-10-14")).toBe(0);
  });
});

describe("demande, vérification et facturation", () => {
  let db: Database;
  let owner: Ctx;
  let admin: Ctx;
  const now = new Date("2026-10-14T10:00:00Z");

  beforeAll(async () => {
    db = await freshDb();
    owner = await signUp(db, "createur@exemple.fr");
    admin = { ...owner, isPlatformAdmin: true, twoFactor: true } as Ctx;
  });

  it("le tarif créateur exige le SIREN puis passe en vérification", async () => {
    await expect(requestBenefit(owner, { kind: "createur", creationDate: "2026-05-02" }, now)).rejects.toThrow(/SIREN/);
    await completeProfile(owner);
    await requestBenefit(owner, { kind: "createur", creationDate: "2026-05-02" }, now);
    expect(await getBenefit(db, owner.orgId)).toMatchObject({ kind: "createur", status: "en_attente", percent: 0 });
    expect(await benefitPercent(db, owner.orgId, now)).toBe(0);
    await expect(pendingBenefits(owner)).rejects.toThrow();
    expect((await pendingBenefits(admin)).map((r) => r.siren)).toEqual(["732829320"]);
  });

  it("un refus exige un motif ; l'accord applique la remise aux factures d'abonnement", async () => {
    const [req] = await pendingBenefits(admin);
    await expect(decideBenefit(admin, req.id, false, " ", now)).rejects.toThrow(/motif/);
    await decideBenefit(admin, req.id, true, "", now);
    await expect(decideBenefit(admin, req.id, true, "", now)).rejects.toThrow(/déjà/);
    expect(await getBenefit(db, owner.orgId)).toMatchObject({ status: "accorde", percent: 50, validUntil: "2027-10-13" });
    expect(await benefitPercent(db, owner.orgId)).toBe(50);
    await expect(requestBenefit(owner, { kind: "createur", creationDate: "2026-05-02" })).rejects.toThrow(/déjà appliqué/);

    await startCheckout(owner, "professionnel", "month", "4242 4242 4242 4242");
    const [inv] = await db.query<{ amount_ht_cents: unknown; amount_ttc_cents: unknown }>("SELECT * FROM billing_invoices WHERE org_id=$1", [owner.orgId]);
    expect(Number(inv.amount_ht_cents)).toBe(2950);
    expect(Number(inv.amount_ttc_cents)).toBe(3540);
  });

  it("un refus garde le motif et permet une nouvelle demande", async () => {
    const other = await signUp(db, "apprentie@exemple.fr", "Menuiserie Lefèvre");
    await expect(
      requestBenefit(other, { kind: "apprenti", school: "CFA du bâtiment", diploma: "CAP menuisier", trainingEnd: "2028-06-30", reference: "" }, now),
    ).rejects.toThrow(/INE/);
    await requestBenefit(
      other,
      { kind: "apprenti", school: "CFA du bâtiment", diploma: "CAP menuisier", trainingEnd: "2028-06-30", reference: "DECA-42" },
      now,
    );
    const req = (await pendingBenefits(admin)).find((r) => r.kind === "apprenti")!;
    await decideBenefit(admin, req.id, false, "Contrat introuvable", now);
    expect(await getBenefit(db, other.orgId)).toMatchObject({ status: "refuse", decisionNote: "Contrat introuvable" });
    await requestBenefit(
      other,
      { kind: "apprenti", school: "CFA du bâtiment", diploma: "CAP menuisier", trainingEnd: "2028-06-30", reference: "DECA-43" },
      now,
    );
    expect(await getBenefit(db, other.orgId)).toMatchObject({ status: "en_attente", decisionNote: "" });
  });
});
