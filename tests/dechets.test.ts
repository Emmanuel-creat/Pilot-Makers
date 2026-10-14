import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { addJobWaste, deleteJobWaste, listJobWaste, wasteRegister, wasteRegisterCsv } from "@/lib/services/waste";
import { entryIssues, registerRow, tonnes, wasteSummary, type WasteEntry } from "@/lib/waste";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const entry = (o: Partial<WasteEntry> = {}): WasteEntry => ({
  id: "x",
  date: "2026-10-01",
  category: "gravats",
  quantity: 2,
  unit: "t",
  destination: "ISDI de Saint-Priest",
  carrier: "",
  slipRef: "",
  sorted: true,
  costCents: 12000,
  ...o,
});

describe("bilan des déchets", () => {
  it("exige un bordereau pour les déchets dangereux et une destination toujours", () => {
    expect(entryIssues(entry())).toEqual([]);
    expect(entryIssues(entry({ category: "amiante" }))).toEqual(["Numéro de BSDA à indiquer"]);
    expect(entryIssues(entry({ category: "peintures", destination: "" }))).toEqual(["Installation de destination à indiquer", "Numéro de BSDD à indiquer"]);
  });

  it("additionne par classe, en tonnes et en volume", () => {
    expect(tonnes(entry({ quantity: 350, unit: "kg" }))).toBe(0.35);
    expect(tonnes(entry({ unit: "m3" }))).toBeNull();
    const s = wasteSummary([
      entry(),
      entry({ quantity: 350, unit: "kg", category: "terres" }),
      entry({ category: "bois", quantity: 3, unit: "m3", sorted: false, costCents: 9000 }),
      entry({ category: "amiante", quantity: 0.2 }),
    ]);
    expect(s.byClass).toEqual([
      { cls: "inerte", label: "Inertes", tonnes: 2.35, volumeM3: 0 },
      { cls: "non_dangereux", label: "Non dangereux", tonnes: 0, volumeM3: 3 },
      { cls: "dangereux", label: "Dangereux", tonnes: 0.2, volumeM3: 0 },
    ]);
    expect(s).toMatchObject({ sortedShare: 75, costCents: 45000, missing: 1 });
    expect(wasteSummary([]).sortedShare).toBeNull();
  });

  it("écrit une ligne du registre avec le code déchet", () => {
    expect(registerRow(entry({ category: "amiante", quantity: 0.25, slipRef: "BSDA-2026-1" }), { title: "Salle de bains", address: "Lyon" })).toEqual([
      "2026-10-01",
      "Salle de bains",
      "Lyon",
      "17 06 05*",
      "Matériaux contenant de l'amiante",
      "0,25",
      "tonne",
      "oui",
      "ISDI de Saint-Priest",
      "",
      "BSDA-2026-1",
      "oui",
    ]);
  });
});

describe("évacuations d'un chantier", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;
  const NOW = new Date("2026-10-14T10:00:00Z");

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "dechets@exemple.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      {
        ...d,
        title: "Cuisine",
        site: { line1: "3 rue Neuve", line2: "", postalCode: "69001", city: "Lyon" },
        sections: [{ ...d.sections[0], lines: [line()] }],
      },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    await recordResponseManually(ctx, id, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    jobId = await createJobFromQuote(ctx, id);
  });

  it("valide puis enregistre les évacuations", async () => {
    const base = { date: "2026-10-10", category: "gravats", quantity: "1,5", unit: "t", destination: "Déchèterie pro", cost: "85,50", sorted: "on" };
    await expect(addJobWaste(ctx, jobId, { ...base, date: "2026-10-20" }, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(addJobWaste(ctx, jobId, { ...base, quantity: "0" }, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(addJobWaste(ctx, jobId, { ...base, category: "inconnu" }, NOW)).rejects.toMatchObject({ status: 400 });
    await expect(addJobWaste(ctx, jobId, { ...base, category: "amiante" }, NOW)).rejects.toMatchObject({ status: 400 });
    await addJobWaste(ctx, jobId, base, NOW);
    await addJobWaste(ctx, jobId, { ...base, date: "2026-10-12", category: "amiante", quantity: "180", unit: "kg", slipRef: "BSDA-123", cost: "" }, NOW);
    const list = await listJobWaste(ctx, jobId);
    expect(list.map((e) => [e.category, e.quantity, e.unit, e.costCents, e.sorted])).toEqual([
      ["gravats", 1.5, "t", 8550, true],
      ["amiante", 180, "kg", 0, true],
    ]);
    const other = await signUp(db, "dechets-autre@exemple.fr", "Autre");
    await expect(addJobWaste(other, jobId, base, NOW)).rejects.toMatchObject({ status: 404 });
    await expect(deleteJobWaste(other, list[0].id)).rejects.toMatchObject({ status: 404 });
  });

  it("tient le registre de l'année et l'exporte", async () => {
    const reg = await wasteRegister(ctx, 2026);
    expect(reg.map((l) => [l.entry.date, l.jobTitle, l.address])).toEqual([
      ["2026-10-12", "Cuisine", "3 rue Neuve, 69001 Lyon"],
      ["2026-10-10", "Cuisine", "3 rue Neuve, 69001 Lyon"],
    ]);
    expect(await wasteRegister(ctx, 2025)).toEqual([]);
    const csv = await wasteRegisterCsv(ctx, 2026);
    const rows = csv.trim().split("\r\n");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toContain("2026-10-10;Cuisine");
    expect(rows[2]).toContain("17 06 05*");
    await expect(wasteRegister(ctx, 12)).rejects.toMatchObject({ status: 400 });
    await deleteJobWaste(ctx, reg[0].entry.id);
    expect(await listJobWaste(ctx, jobId)).toHaveLength(1);
  });
});
