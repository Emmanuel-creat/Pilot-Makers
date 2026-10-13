import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { addTask, createJobFromQuote, deleteTask, getJob, listJobs, progressOf, setTaskProgress, updateJob } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;

async function quote(accept = true) {
  const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, id);
  await saveDraft(
    ctx,
    id,
    {
      ...d,
      title: "Salle de bains",
      site: { line1: "4 place Bellecour", line2: "", postalCode: "69002", city: "Lyon" },
      sections: [
        { id: d.sections[0].id, title: "Démolition", description: "", lines: [line({ label: "Dépose", quantity: "1", unitPrice: "300" })] },
        {
          id: crypto.randomUUID(),
          title: "Carrelage",
          description: "",
          lines: [
            line({ label: "Pose", quantity: "10", unitPrice: "60" }),
            line({ label: "Option frise", quantity: "1", unitPrice: "200", optional: true }),
          ],
        },
      ],
    },
    d.draftRevision,
  );
  await issueQuote(ctx, id);
  if (accept) await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  return id;
}

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "chantiers@exemple.fr");
  await completeProfile(ctx);
});

describe("chantiers", () => {
  it("avancement pondéré par les montants", () => {
    expect(progressOf([])).toBe(0);
    expect(
      progressOf([
        { weight_cents: 30000, progress_bp: 10000 },
        { weight_cents: 60000, progress_bp: 5000 },
      ]),
    ).toBe(6667);
    expect(
      progressOf([
        { weight_cents: 0, progress_bp: 10000 },
        { weight_cents: 0, progress_bp: 0 },
      ]),
    ).toBe(5000);
  });

  it("un devis accepté devient un chantier, ses lignes deviennent des tâches", async () => {
    await expect(createJobFromQuote(ctx, await quote(false))).rejects.toMatchObject({ status: 409 });
    const qid = await quote();
    const id = await createJobFromQuote(ctx, qid);
    expect(await createJobFromQuote(ctx, qid)).toBe(id);
    const { job, tasks, sections, progressBp } = await getJob(ctx, id);
    expect(job).toMatchObject({ title: "Salle de bains", status: "a_planifier", site_city: "Lyon" });
    // L'option non choisie n'est pas une tâche.
    expect(tasks.map((t) => t.label)).toEqual(["Dépose", "Pose"]);
    expect(sections.map((s) => s.section)).toEqual(["Démolition", "Carrelage"]);
    expect(progressBp).toBe(0);

    await setTaskProgress(ctx, tasks[0].id, 100);
    await setTaskProgress(ctx, tasks[1].id, 50);
    const after = await getJob(ctx, id);
    expect(after.job.status).toBe("en_cours");
    // 300 € fait + 300 € sur 600 € = 600 / 900
    expect(after.progressBp).toBe(6667);
    expect(after.tasks[0].done_at).not.toBeNull();
    await expect(setTaskProgress(ctx, tasks[1].id, 120)).rejects.toMatchObject({ status: 400 });

    await addTask(ctx, id, { label: "Nettoyage de fin de chantier" });
    const withManual = await getJob(ctx, id);
    expect(withManual.tasks).toHaveLength(3);
    expect(withManual.progressBp).toBe(6667);
    await expect(deleteTask(ctx, tasks[0].id)).rejects.toMatchObject({ status: 400 });
    await deleteTask(ctx, withManual.tasks[2].id);

    const list = await listJobs(ctx);
    expect(list.find((j) => j.id === id)).toMatchObject({ progressBp: 6667, taskCount: 2, quote_number: expect.any(String) });
  });

  it("fiche chantier : accès, codes chiffrés, contacts, dates", async () => {
    const id = await createJobFromQuote(ctx, await quote());
    await updateJob(ctx, id, {
      title: "Salle de bains Durand",
      status: "en_cours",
      site_line1: "4 place Bellecour",
      site_city: "Lyon",
      site_postal_code: "69002",
      access_notes: "Stationnement dans la cour",
      access_codes: "Portail 4512B",
      contacts: [
        { name: "Gardien", role: "Accès", phone: "06 00 00 00 00" },
        { name: "", role: "", phone: "" },
      ],
      start_date: "2026-11-02",
      end_date: "2026-11-13",
    });
    const { job } = await getJob(ctx, id);
    expect(job).toMatchObject({ access_codes: "Portail 4512B", start_date: "2026-11-02", end_date: "2026-11-13" });
    expect(job.contacts).toHaveLength(1);
    const raw = await db.query<{ access_codes: string }>("SELECT access_codes FROM jobs WHERE id=$1", [id]);
    expect(raw[0].access_codes).not.toContain("4512");
    await expect(updateJob(ctx, id, { title: "X", status: "en_cours", start_date: "2026-11-10", end_date: "2026-11-01" })).rejects.toMatchObject({
      status: 400,
    });
    const other = await signUp(db, "chantiers-autre@exemple.fr", "Autre");
    await expect(getJob(other, id)).rejects.toMatchObject({ status: 404 });
  });
});
