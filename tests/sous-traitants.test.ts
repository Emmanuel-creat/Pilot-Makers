import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import {
  addDocument,
  addToJob,
  compliance,
  createSubcontractor,
  deleteDocument,
  docStatus,
  documentFile,
  getSubcontractor,
  jobSubcontractors,
  listSubcontractors,
  removeFromJob,
  requestDocuments,
  runSubcontractorReminders,
  setSubcontractorArchived,
  subcontractorAlerts,
  updateSubcontractor,
} from "@/lib/services/subcontractors";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let subId: string;
let jobId: string;
const NOW = new Date("2026-10-13T08:00:00Z");
const PDF = new TextEncoder().encode("%PDF-1.4\n% attestation\n");

async function mails(to: string) {
  return db.query<{ subject: string; body: string }>("SELECT subject, body FROM emails WHERE to_address=$1 ORDER BY created_at", [to]);
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "sous-traitance@exemple.fr");
  await completeProfile(ctx);
  const qid = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, qid);
  await saveDraft(ctx, qid, { ...d, title: "Rénovation", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  await issueQuote(ctx, qid);
  await recordResponseManually(ctx, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  jobId = await createJobFromQuote(ctx, qid);
});

describe("état des documents", () => {
  it("à jour, bientôt expiré, expiré, manquant", () => {
    expect(docStatus("2026-12-31", "2026-10-13")).toBe("valide");
    expect(docStatus("2026-11-01", "2026-10-13")).toBe("bientot");
    expect(docStatus("2026-10-12", "2026-10-13")).toBe("expire");
    const c = compliance(
      [
        { kind: "urssaf", valid_until: "2026-03-01" },
        { kind: "urssaf", valid_until: "2027-01-10" },
      ],
      "2026-10-13",
    );
    expect(c.required.map((r) => [r.kind, r.status])).toEqual([
      ["urssaf", "valide"],
      ["decennale", "manquant"],
    ]);
    expect(c.status).toBe("manquant");
  });
});

describe("sous-traitants", () => {
  it("fiche réservée à l'encadrement, SIRET contrôlé", async () => {
    await expect(createSubcontractor({ ...ctx, role: "member" }, { name: "Élec Pro" })).rejects.toMatchObject({ status: 403 });
    await expect(createSubcontractor(ctx, { name: "Élec Pro", siret: "123" })).rejects.toMatchObject({ status: 400 });
    await expect(createSubcontractor(ctx, { name: "Élec Pro", autoRemind: true })).rejects.toMatchObject({ status: 400 });
    subId = await createSubcontractor(ctx, {
      name: "Élec Pro",
      siret: "732 829 320 00074",
      trade: "Électricité",
      contactName: "Mme Roux",
      email: "contact@elecpro.fr",
    });
    const [s] = await listSubcontractors(ctx, {}, NOW);
    expect(s).toMatchObject({ name: "Élec Pro", siret: "73282932000074" });
    expect(s.compliance.status).toBe("manquant");
    expect(await subcontractorAlerts(ctx, NOW)).toEqual([{ id: subId, name: "Élec Pro", status: "manquant" }]);
  });

  it("documents : fichier vérifié, attestation URSSAF valable six mois par défaut", async () => {
    await expect(addDocument(ctx, subId, { kind: "urssaf", file: new TextEncoder().encode("<html>") }, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(addDocument(ctx, subId, { kind: "inconnu" }, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(addDocument(ctx, subId, { kind: "decennale" }, NOW)).rejects.toMatchObject({ status: 400 });
    const urssaf = await addDocument(ctx, subId, { kind: "urssaf", file: PDF, fileName: "attestation vigilance.pdf" }, NOW);
    await addDocument(ctx, subId, { kind: "decennale", validUntil: "2026-10-30", label: "Police AXA 123" }, NOW);
    const s = await getSubcontractor(ctx, subId, NOW);
    expect(s.documents.find((d) => d.id === urssaf)).toMatchObject({ valid_until: "2027-04-13", has_file: true, status: "valide" });
    expect(s.compliance.status).toBe("bientot");
    const f = await documentFile(ctx, urssaf);
    expect(f.type).toBe("application/pdf");
    expect(f.name).toBe("attestation vigilance.pdf");
  });

  it("chantier : obligation de vigilance au-delà de 5 000 euros HT", async () => {
    await addToJob(ctx, jobId, { subcontractorId: subId, scope: "Tableau électrique", amount: "6 200" });
    let [js] = await jobSubcontractors(ctx, jobId, NOW);
    expect(js).toMatchObject({ name: "Élec Pro", amount_ht_cents: 620000, vigilance: true });
    expect(js.compliance.status).toBe("bientot");
    await addToJob(ctx, jobId, { subcontractorId: subId, scope: "Tableau électrique", amount: "1200" });
    [js] = await jobSubcontractors(ctx, jobId, NOW);
    expect(js.vigilance).toBe(false);
    expect((await getSubcontractor(ctx, subId, NOW)).jobs).toHaveLength(1);
    await removeFromJob(ctx, jobId, subId);
    expect(await jobSubcontractors(ctx, jobId, NOW)).toEqual([]);
  });

  it("demande des documents par e-mail et relance automatique hebdomadaire", async () => {
    await requestDocuments(ctx, subId, NOW);
    let sent = await mails("contact@elecpro.fr");
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toContain("Assurance décennale : expire le 30/10/2026");
    expect(sent[0].body).not.toContain("URSSAF");

    // Relance automatique désactivée : rien.
    expect(await runSubcontractorReminders(db, new Date("2026-10-20T08:00:00Z"))).toEqual({ sent: 0 });
    const s = (await getSubcontractor(ctx, subId, NOW)).sub;
    await updateSubcontractor(ctx, subId, { name: s.name, siret: s.siret, email: s.email, contactName: s.contact_name, autoRemind: true });
    // Moins d'une semaine après la dernière demande : rien.
    expect(await runSubcontractorReminders(db, new Date("2026-10-18T08:00:00Z"))).toEqual({ sent: 0 });
    expect(await runSubcontractorReminders(db, new Date("2026-10-20T10:00:00Z"))).toEqual({ sent: 1 });
    expect(await runSubcontractorReminders(db, new Date("2026-10-21T08:00:00Z"))).toEqual({ sent: 0 });
    sent = await mails("contact@elecpro.fr");
    expect(sent).toHaveLength(2);

    // Documents à jour : plus de demande possible ni de relance.
    const old = (await getSubcontractor(ctx, subId, NOW)).documents.find((d) => d.kind === "decennale")!;
    await deleteDocument(ctx, old.id);
    await addDocument(ctx, subId, { kind: "decennale", validUntil: "2027-12-31", file: PDF }, NOW);
    await expect(requestDocuments(ctx, subId, NOW)).rejects.toMatchObject({ status: 409 });
    expect(await runSubcontractorReminders(db, new Date("2026-11-01T08:00:00Z"))).toEqual({ sent: 0 });
    expect(await subcontractorAlerts(ctx, NOW)).toEqual([]);
  });

  it("archivage", async () => {
    await setSubcontractorArchived(ctx, subId, true);
    expect(await listSubcontractors(ctx, {}, NOW)).toEqual([]);
    expect(await listSubcontractors(ctx, { archived: true }, NOW)).toHaveLength(1);
    await expect(addToJob(ctx, jobId, { subcontractorId: subId })).rejects.toMatchObject({ status: 404 });
  });
});
