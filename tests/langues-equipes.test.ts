import { beforeAll, describe, expect, it } from "vitest";
import { isTeamLocale, TEAM_LOCALES, TEAM_TEXT, teamText } from "@/lib/i18n/team";
import type { Ctx } from "@/lib/services/context";
import { myDay, setTeamLocale, teamLocale } from "@/lib/services/team-day";
import { startTimer, stopTimer } from "@/lib/services/timesheets";
import { completeProfile, freshDb, signUp } from "./helpers";

const flat = (o: unknown, prefix = ""): [string, string][] =>
  Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (typeof v === "string" ? [[prefix + k, v] as [string, string]] : flat(v, `${prefix}${k}.`)));

describe("écran des équipes en plusieurs langues", () => {
  it("chaque langue traduit toutes les clés, sans texte vide", () => {
    const keys = flat(TEAM_TEXT.fr).map(([k]) => k);
    expect(keys.length).toBeGreaterThan(25);
    for (const l of Object.keys(TEAM_LOCALES) as (keyof typeof TEAM_LOCALES)[]) {
      const entries = flat(TEAM_TEXT[l]);
      expect(
        entries.map(([k]) => k),
        l,
      ).toEqual(keys);
      for (const [k, v] of entries) expect(v.trim(), `${l}.${k}`).not.toBe("");
    }
  });

  it("chaque langue étrangère est vraiment traduite", () => {
    const fr = new Map(flat(TEAM_TEXT.fr));
    for (const l of Object.keys(TEAM_LOCALES).filter((x) => x !== "fr") as (keyof typeof TEAM_LOCALES)[]) {
      const same = flat(TEAM_TEXT[l]).filter(([k, v]) => fr.get(k) === v && v !== "Total");
      expect(same, l).toEqual([]);
    }
  });

  it("l'arabe s'affiche de droite à gauche ; une langue inconnue retombe sur le français", () => {
    expect(TEAM_LOCALES.ar.dir).toBe("rtl");
    expect(teamText("xx")).toBe(TEAM_TEXT.fr);
    expect(teamText("pt").title).toBe("O meu dia");
    expect(isTeamLocale("toString")).toBe(false);
  });
});

describe("ma journée", () => {
  let ctx: Ctx;
  beforeAll(async () => {
    ctx = await signUp(await freshDb(), "equipe-langues@exemple.fr");
    await completeProfile(ctx);
  });

  it("enregistre la langue de la personne et refuse une langue inconnue", async () => {
    expect(await teamLocale(ctx)).toBe("fr");
    await setTeamLocale(ctx, "ro");
    expect(await teamLocale(ctx)).toBe("ro");
    await expect(setTeamLocale(ctx, "klingon")).rejects.toThrow(/Langue inconnue/);
  });

  it("rassemble chantiers du jour, pointage en cours et heures de la semaine", async () => {
    const empty = await myDay(ctx);
    expect(empty.locale).toBe("ro");
    expect(empty.jobs).toEqual([]);
    expect(empty.running).toBeNull();
    await startTimer(ctx, { jobId: "", latitude: "", longitude: "" });
    expect((await myDay(ctx)).running).not.toBeNull();
    await stopTimer(ctx, { note: "" });
    const after = await myDay(ctx);
    expect(after.running).toBeNull();
    expect(after.entries.length).toBe(1);
  });
});
