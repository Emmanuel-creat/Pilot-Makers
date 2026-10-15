import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { evidenceChecks, manifest, timelineText } from "@/lib/evidence";
import { sha256 } from "@/lib/security";
import type { Ctx } from "@/lib/services/context";
import { evidenceZip, jobEvidence } from "@/lib/services/evidence";
import { createFinalInvoice } from "@/lib/services/invoices";
import { addJournalEntry, liftReserve, signReception } from "@/lib/services/job-site";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { unzip } from "@/lib/zip";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const PNG = `data:image/png;base64,${PNG_B64}`;

describe("points de contrôle", () => {
  it("tout est vert quand le chantier est complètement tracé", () => {
    const all = evidenceChecks({ quoteAccepted: true, photosBefore: 2, photosAfter: 1, reception: "avec_reserves", reservesOpen: 0, invoices: 1 });
    expect(all.every((c) => c.ok)).toBe(true);
    const none = evidenceChecks({ quoteAccepted: false, photosBefore: 0, photosAfter: 0, reception: null, reservesOpen: 0, invoices: 0 });
    expect(none.filter((c) => c.ok)).toEqual([]);
    expect(
      evidenceChecks({ quoteAccepted: true, photosBefore: 0, photosAfter: 0, reception: "refus", reservesOpen: 0, invoices: 0 }).find(
        (c) => c.key === "reception",
      )!.ok,
    ).toBe(false);
  });

  it("empreintes au format sha256sum et chronologie à l'heure de Paris", () => {
    expect(manifest([{ name: "a.pdf", sha256: "ab" }])).toBe("ab  a.pdf\n");
    const t = timelineText("Salle de bains", [
      { at: "2026-10-02T09:00:00.000Z", kind: "photo", text: "Photo du journal", sha256: "f".repeat(64) },
      { at: "2026-10-01T08:00:00.000Z", kind: "devis", text: "Devis accepté" },
    ]);
    expect(t.indexOf("Devis accepté")).toBeLessThan(t.indexOf("Photo du journal"));
    expect(t).toContain("01/10/2026 10:00:00");
  });
});

describe("dossier d'un chantier", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "preuves@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(ctx, id, { ...d, title: "Salle de bains Dubois", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    jobId = await createJobFromQuote(ctx, id);
    await db.query("UPDATE jobs SET start_date='2026-10-02', end_date='2026-10-04' WHERE id=$1", [jobId]);
  });

  it("au départ, signale ce qui manque", async () => {
    const e = await jobEvidence(ctx, jobId);
    expect(e.checks.filter((c) => !c.ok).map((c) => c.key)).toEqual(["avant", "apres", "reception", "reserves", "facture"]);
    expect(e.timeline.map((x) => x.text).join(" | ")).toMatch(/Devis émis.*Devis accepté/);
    await expect(jobEvidence(ctx, "00000000-0000-0000-0000-000000000000")).rejects.toMatchObject({ status: 404 });
  });

  it("archive complète et vérifiable", async () => {
    await addJournalEntry(ctx, jobId, { note: "Existant", photo: Buffer.from(PNG_B64, "base64"), takenAt: "2026-10-01T09:00:00Z" });
    await addJournalEntry(ctx, jobId, { note: "Terminé", photo: Buffer.from(PNG_B64, "base64"), takenAt: "2026-10-05T16:00:00Z" });
    await signReception(ctx, jobId, {
      date: "2026-10-05",
      decision: "avec_reserves",
      reserves: [{ label: "Joint à reprendre", location: "Douche" }],
      clientName: "Claire Dubois",
      clientSignature: PNG,
      companyName: "Paul Martin",
      companySignature: PNG,
    });
    const [res] = await db.query<{ id: string }>("SELECT id FROM job_reserves WHERE job_id=$1", [jobId]);
    await liftReserve(ctx, res.id, "Joint refait");
    const e0 = await jobEvidence(ctx, jobId);
    await createFinalInvoice(ctx, e0.quoteId!);

    const e = await jobEvidence(ctx, jobId);
    expect(e.checks.every((c) => c.ok)).toBe(true);
    expect(e.timeline.some((x) => x.kind === "reception" && x.sha256)).toBe(true);

    const z = await evidenceZip(ctx, jobId);
    expect(z.filename).toMatch(/^Dossier-de-preuves-.*\.zip$/);
    const files = unzip(z.data);
    const names = [...files.keys()];
    expect(names.some((n) => n.startsWith("1-devis/") && n.endsWith("-accepte.pdf"))).toBe(true);
    expect(names.filter((n) => n.startsWith("2-photos/"))).toHaveLength(2);
    expect(names).toContain("3-reception/Proces-verbal-de-reception.pdf");
    expect(names.some((n) => n.startsWith("4-factures/"))).toBe(true);
    const lines = files.get("empreintes-sha256.txt")!.toString().trim().split("\n");
    for (const l of lines) {
      const [hash, name] = l.split("  ");
      expect(sha256(files.get(name)!)).toBe(hash);
    }
    expect(files.get("LISEZMOI.txt")!.toString()).toContain("[x] Procès-verbal de réception signé");
    const audit = await db.query<{ data: { sha256: string } }>("SELECT data FROM audit_logs WHERE action='job.evidence_export'");
    expect(audit[0].data.sha256).toBe(z.sha256);
  });
});
