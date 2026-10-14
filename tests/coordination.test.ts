import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { coordinationIssues, planningText, sortInterventions, timeline, type Intervention } from "@/lib/coordination";
import type { Ctx } from "@/lib/services/context";
import { deleteIntervention, getCoordination, saveIntervention, sendPlanning } from "@/lib/services/coordination";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { createSubcontractor } from "@/lib/services/subcontractors";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const iv = (o: Partial<Intervention> & { id: string }): Intervention => ({
  trade: "plomberie",
  company: "Notre équipe",
  startDate: "2026-11-02",
  endDate: "2026-11-04",
  afterId: null,
  note: "",
  ...o,
});

describe("enchaînement des interventions", () => {
  it("signale dates manquantes, prédécesseur non terminé, ordre inversé et coactivité", () => {
    const list = [
      iv({ id: "a", trade: "demolition", startDate: "2026-11-02", endDate: "2026-11-03" }),
      iv({ id: "b", trade: "plomberie", company: "Plomberie Durand", startDate: "2026-11-03", endDate: "2026-11-05", afterId: "a" }),
      iv({ id: "c", trade: "peinture", startDate: "2026-10-26", endDate: "2026-10-28" }),
      iv({ id: "d", trade: "carrelage", startDate: null, endDate: null }),
    ];
    const issues = coordinationIssues(list);
    expect(issues.map((x) => [x.id, x.kind])).toEqual([
      ["b", "predecessor"],
      ["d", "dates"],
      ["b", "overlap"],
      ["c", "order"],
      ["c", "order"],
    ]);
    expect(issues[0].text).toBe("Plomberie et chauffage commence le 03/11/2026, avant la fin de démolition et dépose (03/11/2026)");
    // La même entreprise sur deux lots qui se croisent : pas de coactivité
    expect(coordinationIssues([iv({ id: "a", trade: "plomberie" }), iv({ id: "b", trade: "electricite" })])).toEqual([]);
  });

  it("classe par date, place sur la frise et rédige le planning", () => {
    const list = [
      iv({ id: "b", trade: "peinture", startDate: "2026-11-05", endDate: "2026-11-06" }),
      iv({ id: "a", trade: "plomberie" }),
      iv({ id: "c", trade: "nettoyage", startDate: null, endDate: null }),
    ];
    expect(sortInterventions(list).map((i) => i.id)).toEqual(["a", "b", "c"]);
    const t = timeline(list)!;
    expect([t.from, t.to]).toEqual(["2026-11-02", "2026-11-06"]);
    expect(t.bars.get("a")).toEqual({ left: 0, width: 60 });
    expect(t.bars.get("b")).toEqual({ left: 60, width: 40 });
    expect(timeline([iv({ id: "x", startDate: null, endDate: null })])).toBeNull();
    expect(planningText("Cuisine", "Lyon", list)).toContain("- Peinture et revêtements muraux (Notre équipe) : du 05/11/2026 au 06/11/2026");
  });
});

describe("coordination d'un chantier", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;
  let sub: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "coordination@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, title: "Cuisine", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    jobId = await createJobFromQuote(ctx, id);
    sub = await createSubcontractor(ctx, { name: "Plomberie Durand", trade: "Plombier", email: "durand@exemple.fr" });
  });

  it("enregistre les interventions et contrôle l'enchaînement", async () => {
    const demo = await saveIntervention(ctx, jobId, { trade: "demolition", startDate: "2026-11-02", endDate: "2026-11-03" });
    await expect(saveIntervention(ctx, jobId, { trade: "inconnu" })).rejects.toMatchObject({ status: 400 });
    await expect(saveIntervention(ctx, jobId, { trade: "plomberie", startDate: "2026-11-05", endDate: "2026-11-04" })).rejects.toMatchObject({ status: 400 });
    await expect(saveIntervention(ctx, jobId, { trade: "plomberie", startDate: "2026-11-05" })).rejects.toMatchObject({ status: 400 });
    await expect(saveIntervention(ctx, jobId, { trade: "plomberie", subcontractorId: "00000000-0000-4000-8000-000000000000" })).rejects.toMatchObject({
      status: 400,
    });
    const plumb = await saveIntervention(ctx, jobId, {
      trade: "plomberie",
      subcontractorId: sub,
      startDate: "2026-11-03",
      endDate: "2026-11-05",
      afterId: demo,
    });
    let c = await getCoordination(ctx, jobId);
    expect(c.interventions.map((i) => [i.trade, i.company])).toEqual([
      ["demolition", "Notre équipe"],
      ["plomberie", "Plomberie Durand"],
    ]);
    expect(c.issues.map((x) => x.kind)).toContain("predecessor");
    expect(c.recipients.map((r) => r.name)).toEqual(["Plomberie Durand"]);
    await saveIntervention(ctx, jobId, { trade: "plomberie", subcontractorId: sub, startDate: "2026-11-04", endDate: "2026-11-06", afterId: demo }, plumb);
    c = await getCoordination(ctx, jobId);
    expect(c.issues).toEqual([]);
    await expect(saveIntervention(ctx, jobId, { trade: "plomberie", afterId: plumb }, plumb)).rejects.toMatchObject({ status: 400 });
  });

  it("envoie le planning aux sous-traitants et supprime une intervention", async () => {
    expect(await sendPlanning(ctx, jobId)).toBe(1);
    const mail = await db.query<{ to_address: string; body: string }>("SELECT to_address, body FROM emails WHERE org_id=$1 AND subject LIKE 'Planning%'", [
      ctx.orgId,
    ]);
    expect(mail[0].to_address).toBe("durand@exemple.fr");
    expect(mail[0].body).toContain("Plomberie et chauffage (Plomberie Durand) : du 04/11/2026 au 06/11/2026");
    expect((await getCoordination(ctx, jobId)).job.planningSentAt).not.toBeNull();
    const c = await getCoordination(ctx, jobId);
    const other = await signUp(db, "coordination-autre@exemple.fr", "Autre");
    await expect(deleteIntervention(other, c.interventions[0].id)).rejects.toMatchObject({ status: 404 });
    await expect(getCoordination(other, jobId)).rejects.toMatchObject({ status: 404 });
    expect(await deleteIntervention(ctx, c.interventions[0].id)).toBe(jobId);
    const after = await getCoordination(ctx, jobId);
    expect(after.interventions).toHaveLength(1);
    expect(after.interventions[0].afterId).toBeNull();
  });
});
