import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { companyIdLine, countryOf, countryVatIssues, rulesFor, validateCompanyId, validateCountryPostalCode, validateForeignVat } from "@/lib/country-rules";
import type { Ctx } from "@/lib/services/context";
import { getOrganization, updateOrganization } from "@/lib/services/organization";
import { createQuote, getDraft, previewQuote, saveDraft } from "@/lib/services/quotes";
import { freshDb, line, makeCustomer, signUp } from "./helpers";

describe("règles par pays", () => {
  it("reconnaît le pays saisi et garde la France par défaut", () => {
    expect(countryOf("Belgique")).toBe("BE");
    expect(countryOf(" suisse ")).toBe("CH");
    expect(countryOf("LU")).toBe("LU");
    expect(countryOf("")).toBe("FR");
    expect(countryOf("Espagne")).toBe("FR");
    expect(rulesFor("Belgique").vatOptions).toEqual(["21", "12", "6", "0"]);
    expect(rulesFor("Suisse").vatRatesBp).toEqual([810, 380, 260, 0]);
    expect(rulesFor("Luxembourg").vatRatesBp).toContain(300);
  });

  it("contrôle les identifiants d'entreprise avec leur clé", () => {
    expect(validateCompanyId("BE", "0123.456.749")).toBeNull();
    expect(validateCompanyId("BE", "0123.456.748")).toMatch(/belge invalide/);
    expect(validateCompanyId("CH", "CHE-109.322.551")).toBeNull();
    expect(validateCompanyId("CH", "CHE-109.322.552")).toMatch(/IDE invalide/);
    expect(validateCompanyId("LU", "B123456")).toBeNull();
    expect(validateCompanyId("LU", "123456")).toMatch(/RCS/);
    expect(validateCompanyId("FR", "n'importe quoi")).toBeNull();
  });

  it("contrôle les numéros de TVA belges, suisses et luxembourgeois", () => {
    expect(validateForeignVat("BE", "BE 0123.456.749")).toBeNull();
    expect(validateForeignVat("BE", "BE0123456748")).toMatch(/belge/);
    expect(validateForeignVat("CH", "CHE-109.322.551 TVA")).toBeNull();
    expect(validateForeignVat("CH", "CHE-109.322.551")).toMatch(/suisse/);
    expect(validateForeignVat("LU", "LU15027442")).toBeNull();
    expect(validateForeignVat("LU", "LU15027443")).toMatch(/Clé/);
  });

  it("accepte les codes postaux à 4 chiffres hors de France", () => {
    expect(validateCountryPostalCode("BE", "1000")).toBeNull();
    expect(validateCountryPostalCode("LU", "L-1450")).toBeNull();
    expect(validateCountryPostalCode("CH", "75001")).toMatch(/suisse à 4 chiffres/);
    expect(validateCountryPostalCode("FR", "1000")).toMatch(/5 chiffres/);
  });

  it("imprime l'identifiant du pays et signale les taux étrangers", () => {
    expect(companyIdLine({ country: "Belgique", siren: "0123.456.749", siret: "" })).toBe("N° d'entreprise 0123.456.749");
    expect(companyIdLine({ country: "France", siren: "732829320", siret: "73282932000074" })).toBe("SIRET 73282932000074");
    expect(countryVatIssues("Belgique", [2100, 600])).toEqual([]);
    expect(countryVatIssues("Belgique", [2000])[0]).toMatchObject({ code: "country_vat", blocking: false });
    expect(countryVatIssues("Luxembourg", [2000])[0].message).toContain("au Luxembourg");
    expect(countryVatIssues("France", [2100])).toEqual([]);
    expect(countryVatIssues("Suisse", [2000], true)).toEqual([]);
  });
});

describe("entreprise établie en Belgique", () => {
  let db: Database;
  let ctx: Ctx;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "belge@exemple.be");
  });

  it("enregistre le profil belge et contrôle les taux du devis", async () => {
    await expect(updateOrganization(ctx, { country: "Belgique", siren: "0123.456.748" })).rejects.toMatchObject({ status: 400 });
    await expect(updateOrganization(ctx, { country: "Belgique", postal_code: "75001" })).rejects.toMatchObject({ status: 400 });
    await updateOrganization(ctx, {
      country: "Belgique",
      legal_name: "Rénov Bruxelles SRL",
      address_line1: "Rue Neuve 12",
      postal_code: "1000",
      city: "Bruxelles",
      siren: "0123.456.749",
      vat_number: "BE0123456749",
      phone: "+32 2 000 00 00",
      insurance_decennale: true,
      insurance_name: "Assurances Exemple",
      insurance_policy: "DEC-1",
      insurance_area: "Belgique",
    });
    expect((await getOrganization(ctx)).country).toBe("Belgique");
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, title: "Salle de bains", sections: [{ ...d.sections[0], lines: [line({ vatPercent: "20" })] }] }, d.draftRevision);
    let p = await previewQuote(ctx, id);
    expect(p.issues.map((i) => i.code)).toContain("country_vat");
    expect(p.issues.map((i) => i.code)).not.toContain("org_siret");
    const d2 = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d2, sections: [{ ...d2.sections[0], lines: [line({ vatPercent: "6" })] }] }, d2.draftRevision);
    p = await previewQuote(ctx, id);
    expect(p.issues.map((i) => i.code)).not.toContain("country_vat");
  });
});
