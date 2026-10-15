import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { applyRuleVersions, countryVatIssues, nextRuleVersion, parseVatList, type RuleVersion } from "@/lib/country-rules";
import type { Ctx } from "@/lib/services/context";
import { countryRulesInfo, countryRulesOverview, deleteRuleVersion, effectiveRules, publishRuleVersion } from "@/lib/services/country-rules";
import { updateOrganization } from "@/lib/services/organization";
import { addDays, createQuote, getDraft, parisDate, previewQuote, saveDraft } from "@/lib/services/quotes";
import { freshDb, line, makeCustomer, signUp } from "./helpers";

const v = (country: RuleVersion["country"], effectiveFrom: string, vatOptions: string[]): RuleVersion => ({
  country,
  effectiveFrom,
  vatOptions,
  mentions: [],
  note: "test",
});

describe("moteur de règles par pays : calculs", () => {
  it("lit une liste de taux saisie librement", () => {
    expect(parseVatList("21 ; 12 ; 6 ; 0")).toEqual({ options: ["21", "12", "6", "0"], bps: [2100, 1200, 600, 0] });
    expect(parseVatList("5.5% / 20 / 20")).toEqual({ options: ["5,5", "20"], bps: [550, 2000] });
    expect(parseVatList("")).toBe("Indiquez au moins un taux de TVA");
    expect(parseVatList("abc")).toContain("illisible");
    expect(parseVatList("45")).toContain("trop élevé");
  });

  it("applique la dernière version en vigueur à la date et annonce la suivante", () => {
    const versions = [v("BE", "2026-01-01", ["21", "6", "0"]), v("BE", "2027-01-01", ["22", "6", "0"]), v("LU", "2020-01-01", ["16"])];
    expect(applyRuleVersions("BE", versions, "2025-12-31").vatRatesBp).toEqual([2100, 1200, 600, 0]);
    expect(applyRuleVersions("BE", versions, "2025-12-31").version).toBeNull();
    expect(applyRuleVersions("BE", versions, "2026-06-01").vatRatesBp).toEqual([2100, 600, 0]);
    expect(applyRuleVersions("BE", versions, "2027-01-01").vatOptions).toEqual(["22", "6", "0"]);
    expect(nextRuleVersion("BE", versions, "2026-06-01")?.effectiveFrom).toBe("2027-01-01");
    expect(nextRuleVersion("BE", versions, "2027-06-01")).toBeNull();
  });

  it("contrôle aussi la France dès qu'une version publiée change ses taux", () => {
    expect(countryVatIssues("France", [2100])).toEqual([]);
    const fr = applyRuleVersions("FR", [v("FR", "2026-01-01", ["21", "10", "5,5", "0"])], "2026-02-01");
    expect(countryVatIssues("France", [2000], false, fr)[0]).toMatchObject({ code: "country_vat" });
    expect(countryVatIssues("France", [2100], false, fr)).toEqual([]);
  });
});

describe("moteur de règles par pays : publication", () => {
  let db: Database;
  let ctx: Ctx;
  let admin: Ctx;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "regles@exemple.be");
    admin = { ...ctx, isPlatformAdmin: true, twoFactor: true } as Ctx;
  });

  it("réserve la publication à l'administration et exige une source", async () => {
    const input = { country: "BE", effectiveFrom: parisDate(new Date()), vatRates: "21;6;0", mentions: "", note: "Circulaire" };
    await expect(publishRuleVersion(ctx, input)).rejects.toMatchObject({ status: 403 });
    await expect(publishRuleVersion(admin, { ...input, note: " " })).rejects.toMatchObject({ status: 400 });
    await expect(publishRuleVersion(admin, { ...input, country: "ES" })).rejects.toMatchObject({ status: 400 });
    await expect(publishRuleVersion(admin, { ...input, effectiveFrom: "demain" })).rejects.toMatchObject({ status: 400 });
  });

  it("applique une version datée aux devis sans nouvelle version du logiciel", async () => {
    await updateOrganization(ctx, { country: "Belgique", postal_code: "1000", city: "Bruxelles" });
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, title: "Cuisine", sections: [{ ...d.sections[0], lines: [line({ vatPercent: "12" })] }] }, d.draftRevision);
    expect((await previewQuote(ctx, id)).issues.map((i) => i.code)).not.toContain("country_vat");

    await publishRuleVersion(admin, {
      country: "BE",
      effectiveFrom: parisDate(new Date()),
      vatRates: "21 ; 6 ; 0",
      mentions: "Mention nouvelle\n\n",
      note: "Loi du jour",
    });
    expect((await effectiveRules(db, "Belgique")).vatOptions).toEqual(["21", "6", "0"]);
    expect((await effectiveRules(db, "Belgique")).mentions).toEqual(["Mention nouvelle"]);
    expect((await previewQuote(ctx, id)).issues.map((i) => i.code)).toContain("country_vat");

    const future = parisDate(addDays(new Date(), 30));
    await publishRuleVersion(admin, { country: "BE", effectiveFrom: future, vatRates: "21;12;6;0", mentions: "", note: "Retour du taux de 12 %" });
    const info = await countryRulesInfo(db, "Belgique");
    expect(info.next?.effectiveFrom).toBe(future);
    expect(info.current.vatOptions).toEqual(["21", "6", "0"]);
    const be = (await countryRulesOverview(admin)).find((c) => c.code === "BE")!;
    expect(be.history).toHaveLength(2);

    const today = be.history.find((h) => h.effectiveFrom !== future)!;
    await expect(deleteRuleVersion(admin, today.id)).rejects.toMatchObject({ status: 403 });
    await deleteRuleVersion(admin, be.history.find((h) => h.effectiveFrom === future)!.id);
    expect((await countryRulesInfo(db, "Belgique")).next).toBeNull();
    await expect(deleteRuleVersion(admin, "nope")).rejects.toMatchObject({ status: 404 });
  });
});
