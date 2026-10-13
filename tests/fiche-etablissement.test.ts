import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { businessJsonLd, hoursLines, jsonLdScript, listingChecks, listingFields, listingText, parseDayHours } from "@/lib/business-listing";
import type { Ctx } from "@/lib/services/context";
import { getListing, markListingChecked, publicShowcase, updateListing, updateShowcase } from "@/lib/services/showcase";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "fiche@exemple.fr");
  await completeProfile(ctx);
});

describe("fiche d'établissement en ligne", () => {
  it("comprend les horaires tapés librement", () => {
    expect(parseDayHours("8h-12h, 14h-18h")).toEqual([
      ["08:00", "12:00"],
      ["14:00", "18:00"],
    ]);
    expect(parseDayHours("08:30 à 17h30")).toEqual([["08:30", "17:30"]]);
    expect(parseDayHours("fermé")).toEqual([]);
    expect(parseDayHours("")).toEqual([]);
    expect(parseDayHours("18h-8h")).toBeNull();
    expect(parseDayHours("8h-12h, 11h-15h")).toBeNull();
    expect(parseDayHours("le matin")).toBeNull();
    expect(parseDayHours("8h-12h et 14")).toBeNull();
    const week = { mo: [["08:00", "12:00"]], tu: [["08:00", "12:00"]], we: [["08:00", "12:00"]], sa: [["09:00", "12:30"]] } as const;
    expect(hoursLines(week as never)).toEqual(["Lundi au mercredi : 8h - 12h", "Jeudi et vendredi : Fermé", "Samedi : 9h - 12h30", "Dimanche : Fermé"]);
  });

  it("signale ce qui manque puis enregistre horaires et liens", async () => {
    let l = await getListing(ctx);
    let checks = listingChecks(l);
    expect(checks.some((c) => c.level === "manque" && /horaires/.test(c.message))).toBe(true);
    expect(checks.some((c) => /premi[eè]re fois/.test(c.message))).toBe(true);
    await expect(updateListing(ctx, { hours: { mo: "midi" }, links: [] })).rejects.toMatchObject({ status: 400 });
    await expect(updateListing(ctx, { hours: {}, links: [{ site: "Google", url: "javascript:alert(1)" }] })).rejects.toMatchObject({ status: 400 });
    await updateListing(ctx, {
      hours: { mo: "8h-12h, 14h-18h", tu: "8h-12h, 14h-18h", we: "8h-12h, 14h-18h", th: "8h-12h, 14h-18h", fr: "8h-12h, 14h-17h", sa: "fermé" },
      links: [
        { site: "Google", url: "https://g.page/martin-carrelage" },
        { site: "PagesJaunes", url: "" },
      ],
    });
    await markListingChecked(ctx);
    l = await getListing(ctx);
    expect(l.links).toEqual([{ site: "Google", url: "https://g.page/martin-carrelage" }]);
    expect(l.checkedAt).toBeInstanceOf(Date);
    checks = listingChecks(l);
    expect(checks.some((c) => /horaires/.test(c.message))).toBe(false);
    expect(checks.some((c) => /six mois|premi/.test(c.message))).toBe(false);
    expect(listingChecks(l, new Date(Date.now() + 200 * 86_400_000)).some((c) => /six mois/.test(c.message))).toBe(true);
    const fields = listingFields(l);
    expect(fields.find((f) => f.key === "address")?.value).toBe("12 rue des Artisans, 69003 Lyon");
    expect(listingText(fields)).toContain("Horaires :\nLundi au jeudi : 8h - 12h, 14h - 18h\nVendredi : 8h - 12h, 14h - 17h");
  });

  it("publie les données structurées sur la vitrine", async () => {
    await updateShowcase(ctx, {
      enabled: true,
      slug: "fiche-lyon",
      intro: "Carreleur </script> à Lyon.",
      area: "Lyon et 30 km",
      show_phone: "on",
      show_email: "",
    });
    const p = await publicShowcase(db, "fiche-lyon");
    expect(p?.hours.mo).toEqual([
      ["08:00", "12:00"],
      ["14:00", "18:00"],
    ]);
    const ld = businessJsonLd({ ...p!, url: "https://exemple.fr/pro/fiche-lyon", logoUrl: null });
    expect(ld["@type"]).toBe("HomeAndConstructionBusiness");
    expect(ld.telephone).toBe("04 72 00 00 00");
    expect(ld.identifier).toMatchObject({ propertyID: "SIRET", value: "73282932000074" });
    expect((ld.openingHoursSpecification as unknown[]).length).toBe(10);
    expect(ld.email).toBeUndefined();
    const script = jsonLdScript(ld);
    expect(script).not.toContain("</script>");
    expect(JSON.parse(script).description).toContain("</script>");
  });

  it("réservé aux personnes qui gèrent les réglages", async () => {
    const member = { ...ctx, role: "member" } as Ctx;
    await expect(updateListing(member, { hours: {}, links: [] })).rejects.toMatchObject({ status: 403 });
    await expect(markListingChecked(member)).rejects.toMatchObject({ status: 403 });
  });
});
