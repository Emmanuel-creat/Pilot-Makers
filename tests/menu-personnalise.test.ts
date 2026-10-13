import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { DEFAULT_MAIN, MOBILE_SLOTS, resolveMenu } from "@/lib/menu";
import type { Ctx } from "@/lib/services/context";
import { getMenu, saveMenu } from "@/lib/services/menu-prefs";
import { completeProfile, freshDb, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "menu@exemple.fr");
  await completeProfile(ctx);
});

describe("menu personnalisé", () => {
  it("nettoie les préférences enregistrées", () => {
    expect(resolveMenu(null).main.map((m) => m.key)).toEqual(DEFAULT_MAIN);
    const r = resolveMenu({ main: ["clients", "inconnu", "clients", 3, "devis"], mobile: ["devis", "clients", "factures", "planning"] });
    expect(r.main.map((m) => m.key)).toEqual(["clients", "devis"]);
    expect(r.mobile).toHaveLength(MOBILE_SLOTS);
    expect(r.customized).toBe(true);
    expect(r.hidden.some((m) => m.key === "banque")).toBe(true);
    const limited = resolveMenu({ main: ["comptabilite", "devis"], mobile: [] }, (m) => m.needs !== "billing");
    expect(limited.main.map((m) => m.key)).toEqual(["devis"]);
    expect(limited.available.some((m) => m.key === "comptabilite")).toBe(false);
  });

  it("enregistre, refuse l'invalide et revient au menu d'origine", async () => {
    expect((await getMenu(ctx)).customized).toBe(false);
    const saved = await saveMenu(ctx, { main: ["planning", "devis", "sous-traitants"], mobile: ["planning"] });
    expect(saved.main.map((m) => m.key)).toEqual(["planning", "devis", "sous-traitants"]);
    expect(saved.mobile.map((m) => m.key)).toEqual(["planning"]);
    await expect(saveMenu(ctx, { main: ["pirate"], mobile: [] })).rejects.toMatchObject({ status: 400 });
    await expect(saveMenu(ctx, { main: [], mobile: ["devis", "clients", "planning", "factures"] })).rejects.toMatchObject({ status: 400 });
    const member = { ...ctx, role: "member" } as Ctx;
    expect((await getMenu(member)).main.map((m) => m.key)).toEqual(["planning", "devis"]);
    const reset = await saveMenu(ctx, null);
    expect(reset.customized).toBe(false);
  });
});
