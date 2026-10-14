import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { climateZone, diagnose, energyClass, incomeCategory, isIleDeFrance, performance, type DiagnosisInput } from "@/lib/energy-diagnosis";
import type { Ctx } from "@/lib/services/context";
import { getDiagnosis, listDiagnoses, quoteFromDiagnosis, saveDiagnosis } from "@/lib/services/energy-diagnoses";
import { getDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

const SIEVE: DiagnosisInput = {
  housing: "maison",
  surface: 100,
  period: "1948_1974",
  postalCode: "69003",
  heating: "fioul",
  roof: "non",
  walls: "non",
  floor: "non",
  windows: "simple",
  ventilation: "naturelle",
  householdSize: 3,
  income: 28000,
};

describe("diagnostic énergétique : calcul", () => {
  it("étiquette à double seuil : la plus mauvaise des deux", () => {
    expect(energyClass(70, 6)).toBe("A");
    expect(energyClass(71, 6)).toBe("B");
    expect(energyClass(60, 31)).toBe("D");
    expect(energyClass(421, 10)).toBe("G");
  });

  it("zones climatiques et Île-de-France", () => {
    expect(climateZone("69003")).toBe("H1");
    expect(climateZone("33000")).toBe("H2");
    expect(climateZone("13001")).toBe("H3");
    expect(isIleDeFrance("92100")).toBe(true);
    expect(isIleDeFrance("69003")).toBe(false);
  });

  it("catégorie de revenus selon les plafonds 2025, au-delà de 5 personnes compris", () => {
    expect(incomeCategory(1, 17173, false)).toBe("tres_modeste");
    expect(incomeCategory(1, 17174, false)).toBe("modeste");
    expect(incomeCategory(3, 54592, false)).toBe("intermediaire");
    expect(incomeCategory(3, 54593, false)).toBe("superieur");
    expect(incomeCategory(1, 20000, true)).toBe("tres_modeste");
    expect(incomeCategory(6, 40388 + 5078, false)).toBe("tres_modeste");
    expect(incomeCategory(6, 40388 + 5079, false)).toBe("modeste");
  });

  it("l'isolation et la pompe à chaleur améliorent l'étiquette", () => {
    const before = performance(SIEVE);
    const after = performance({ ...SIEVE, roof: "bonne", walls: "bonne", heating: "pac" });
    expect(before.energyClass).toBe("G");
    expect(after.primaryKwhM2).toBeLessThan(before.primaryKwhM2);
    expect(after.yearlyBill).toBeLessThan(before.yearlyBill);
  });

  it("passoire thermique : travaux classés par rentabilité, aides par geste ou d'ampleur", () => {
    const d = diagnose(SIEVE);
    expect(d.sieve).toBe(true);
    expect(d.income).toBe("tres_modeste");
    expect(d.works.map((w) => w.key).sort()).toEqual(["fenetres", "murs_ext", "pac", "plancher", "toiture", "vmc"]);
    const ratio = (w: (typeof d.works)[number]) => w.yearlySaving / ((w.costMin + w.costMax) / 2);
    for (let i = 1; i < d.works.length; i++) expect(ratio(d.works[i - 1])).toBeGreaterThanOrEqual(ratio(d.works[i]));
    // Murs : 110 m² mais aide plafonnée à 100 m², 75 € par m² pour un foyer très modeste.
    expect(d.works.find((w) => w.key === "murs_ext")!.aid).toBe(7500);
    expect(d.works.find((w) => w.key === "plancher")!.aid).toBe(0);
    expect(d.classGain).toBeGreaterThanOrEqual(2);
    expect(d.ampleurAid).toBeGreaterThan(d.gestureAid);
    expect(d.bestAid).toBe(d.ampleurAid);
    expect(d.remainingMax).toBeGreaterThan(d.remainingMin);
    expect(d.yearlySaving).toBeGreaterThan(0);
  });

  it("appartement : pas de toiture, de plancher ni de pompe à chaleur ; sans revenus, pas d'aide estimée", () => {
    const d = diagnose({ ...SIEVE, housing: "appartement", income: "" });
    expect(d.works.map((w) => w.key).sort()).toEqual(["fenetres", "murs_int", "vmc"]);
    expect(d.income).toBeNull();
    expect(d.bestAid).toBe(0);
    expect(d.ampleurAid).toBeNull();
  });

  it("fenêtres en double vitrage ancien : remplacement proposé mais sans aide", () => {
    const d = diagnose({ ...SIEVE, windows: "double_ancien" });
    expect(d.works.find((w) => w.key === "fenetres")!.aid).toBe(0);
  });

  it("logement déjà performant : rien à proposer", () => {
    const d = diagnose({
      ...SIEVE,
      period: "apres_2012",
      roof: "bonne",
      walls: "bonne",
      floor: "bonne",
      windows: "double_recent",
      ventilation: "vmc_double",
      heating: "pac",
    });
    expect(d.works).toEqual([]);
    expect(d.classGain).toBe(0);
  });
});

describe("diagnostic énergétique : enregistrement et devis", () => {
  let db: Database;
  let ctx: Ctx;
  let customerId: string;
  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "diagnostic@exemple.fr");
    await completeProfile(ctx);
    customerId = await makeCustomer(ctx);
  });

  it("enregistre, relit et liste un diagnostic", async () => {
    const id = await saveDiagnosis(ctx, { ...SIEVE, surface: "100", householdSize: "3", income: "28000" }, customerId);
    const r = await getDiagnosis(ctx, id);
    expect(r.current_class).toBe("G");
    expect(r.diagnosis.works.length).toBe(6);
    expect((await listDiagnoses(ctx))[0].id).toBe(id);
    await expect(saveDiagnosis(ctx, { ...SIEVE, postalCode: "690" }, null)).rejects.toThrow(/Code postal/);
    await expect(saveDiagnosis(ctx, SIEVE, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/Client introuvable/);
  });

  it("crée le devis des travaux cochés avec TVA à 5,5 %, prix à vérifier et aides renseignées", async () => {
    const id = await saveDiagnosis(ctx, SIEVE, customerId);
    await expect(quoteFromDiagnosis(ctx, id, [])).rejects.toThrow(/au moins un/);
    const quoteId = await quoteFromDiagnosis(ctx, id, ["toiture", "pac"]);
    const draft = await getDraft(ctx, quoteId);
    expect(draft.customerId).toBe(customerId);
    const lines = draft.sections[0].lines;
    expect(lines.map((l) => l.label)).toEqual(expect.arrayContaining(["Isolation des combles ou de la toiture", "Pompe à chaleur air/eau"]));
    expect(lines.every((l) => l.vatPercent === "5.5" || l.vatPercent === "5,5")).toBe(true);
    expect(lines.every((l) => l.estimated)).toBe(true);
    expect(draft.energyAid?.programs).toEqual(["mpr", "cee"]);
    expect(draft.energyAid?.domains.sort()).toEqual(["isolation_combles", "pac"]);
    expect(draft.energyAid?.estimatedAid).toBe("7500"); // 100 m² x 25 € + 5 000 €
    expect((await getDiagnosis(ctx, id)).quote_id).toBe(quoteId);
  });
});
