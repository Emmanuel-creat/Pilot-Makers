import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { getSafetyPlan, safetyPdf, saveSafetyPlan } from "@/lib/services/safety";
import { protectiveEquipment, requiredSurveys, suggestRisks } from "@/lib/safety";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("risques du chantier", () => {
  it("propose les risques d'après les travaux", () => {
    expect(suggestRisks({ labels: ["Réfection de la toiture", "Pose de gouttières"], buildingYear: null, otherCompanies: false })).toEqual([
      "hauteur",
      "chute_plainpied",
      "manutention",
    ]);
    const bath = suggestRisks({ labels: ["Démolition de la faïence", "Pose de carrelage", "Peinture du plafond"], buildingYear: 1932, otherCompanies: true });
    expect(bath).toEqual(expect.arrayContaining(["poussieres", "amiante", "plomb", "chimique", "bruit", "coactivite"]));
    // Bâtiment récent : pas d'amiante proposé d'office
    expect(suggestRisks({ labels: ["Démolition d'une cloison"], buildingYear: 2005, otherCompanies: false })).not.toContain("amiante");
  });

  it("liste les repérages obligatoires et les protections", () => {
    expect(requiredSurveys(1960)).toHaveLength(1);
    expect(requiredSurveys(1930)).toHaveLength(2);
    expect(requiredSurveys(2010)).toEqual([]);
    expect(requiredSurveys(null)).toEqual([]);
    const ppe = protectiveEquipment(["poussieres", "plomb"]);
    expect(ppe[0]).toBe("Chaussures de sécurité");
    expect(ppe.filter((x) => x.startsWith("Masque FFP3"))).toHaveLength(2);
    expect(new Set(ppe).size).toBe(ppe.length);
  });
});

describe("plan de prévention d'un chantier", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "prevention@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Salle de bains",
        sections: [{ ...d.sections[0], lines: [line({ label: "Démolition de la faïence" }), line({ label: "Pose de carrelage" })] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    jobId = await createJobFromQuote(ctx, id);
  });

  it("propose un plan tant qu'il n'est pas enregistré", async () => {
    const s = await getSafetyPlan(ctx, jobId);
    expect(s.saved).toBe(false);
    expect(s.plan.risks).toEqual(expect.arrayContaining(["poussieres", "manutention", "bruit"]));
    await expect(safetyPdf(ctx, jobId)).rejects.toMatchObject({ status: 400 });
  });

  it("enregistre le plan et produit le document à afficher", async () => {
    await expect(saveSafetyPlan(ctx, jobId, { risks: [], manager: "Paul" })).rejects.toMatchObject({ status: 400 });
    await expect(saveSafetyPlan(ctx, jobId, { risks: ["hauteur"], manager: "" })).rejects.toMatchObject({ status: 400 });
    await expect(saveSafetyPlan(ctx, jobId, { risks: ["hauteur"], manager: "Paul", buildingYear: "19" })).rejects.toMatchObject({ status: 400 });
    await saveSafetyPlan(ctx, jobId, {
      risks: ["poussieres", "inconnu", "amiante"],
      buildingYear: "1975",
      manager: "Paul Martin",
      firstAider: "Julie Morel",
      hospital: "Hôpital Édouard-Herriot, 5 place d'Arsonval, Lyon",
      meetingPoint: "Devant le portail",
      instructions: "Occupants présents le matin.",
    });
    const s = await getSafetyPlan(ctx, jobId);
    expect(s.saved).toBe(true);
    expect(s.plan).toMatchObject({ risks: ["poussieres", "amiante"], buildingYear: 1975, firstAider: "Julie Morel" });
    expect(s.surveys).toHaveLength(1);
    const doc = await PDFDocument.load(await safetyPdf(ctx, jobId));
    expect(doc.getTitle()).toBe("Plan de prévention : Salle de bains");
    const other = await signUp(db, "prevention-autre@exemple.fr", "Autre");
    await expect(getSafetyPlan(other, jobId)).rejects.toMatchObject({ status: 404 });
    await expect(saveSafetyPlan(other, jobId, { risks: ["hauteur"], manager: "X" })).rejects.toMatchObject({ status: 404 });
  });
});
