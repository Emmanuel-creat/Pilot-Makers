import { describe, expect, it } from "vitest";
import type { Ctx } from "@/lib/services/context";
import { createQuote, getDraft, issueQuote, saveDraft } from "@/lib/services/quotes";
import { myTimeSaved, publicTimeSaved } from "@/lib/services/time-saved";
import { formatDuration, PUBLIC_MIN_ORGS, TIME_SOURCES, timeSaved } from "@/lib/time-saved";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("calcul des heures rendues", () => {
  it("multiplie chaque tâche par sa durée estimée", () => {
    const t = timeSaved({ devis: 4, relances_factures: 10, inconnu: 99, pointage: -3 });
    expect(t.totalMinutes).toBe(4 * 15 + 10 * 6);
    expect(t.hours).toBe(2);
    expect(t.lines).toHaveLength(TIME_SOURCES.length);
    expect(t.lines.find((l) => l.key === "pointage")?.count).toBe(0);
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(1505)).toBe("25 h 05");
  });
});

describe("décompte en base", () => {
  it("compte les devis émis de l'entreprise et ne publie le total commun qu'au-delà du seuil", async () => {
    const db = await freshDb();
    const ctx: Ctx = await signUp(db, "heures@rendues.fr");
    await completeProfile(ctx);
    const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, id);
    await saveDraft(
      ctx,
      id,
      { ...d, title: "Sol", site: { line1: "1 rue A", line2: "", postalCode: "69001", city: "Lyon" }, sections: [{ ...d.sections[0], lines: [line()] }] },
      d.draftRevision,
    );
    await issueQuote(ctx, id);
    const mine = await myTimeSaved(ctx);
    expect(mine.month.lines.find((l) => l.key === "devis")?.count).toBe(1);
    expect(mine.year.totalMinutes).toBeGreaterThanOrEqual(15);
    const closed = await publicTimeSaved(db);
    expect(closed).toMatchObject({ published: false, organizations: 1 });
    for (let i = 0; i < PUBLIC_MIN_ORGS; i++) await signUp(db, `artisan${i}@rendues.fr`, `Artisan ${i}`);
    const open = await publicTimeSaved(db);
    expect(open.published).toBe(true);
    if (open.published) {
      expect(open.lines.find((l) => l.key === "devis")?.count).toBe(1);
      expect(JSON.stringify(open)).not.toMatch(/heures@rendues|Carrelage/);
    }
  });
});
