import { describe, expect, it } from "vitest";
import { createJobFromQuote } from "@/lib/services/jobs";
import { addVehicle, assign } from "@/lib/services/planning";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { todaySummary } from "@/lib/services/today";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

describe("résumé du jour", () => {
  it("liste les chantiers du jour avec l'équipe et les devis en attente", async () => {
    const db = await freshDb();
    const ctx = await signUp(db, "jour@exemple.fr");
    await completeProfile(ctx);
    const make = async (title: string) => {
      const id = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
      const d = await getDraft(ctx, id);
      await saveDraft(ctx, id, { ...d, title, sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
      await issueQuote(ctx, id);
      return id;
    };
    const accepted = await make("Salle de bains");
    await recordResponseManually(ctx, accepted, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
    const job = await createJobFromQuote(ctx, accepted);
    const van = await addVehicle(ctx, { name: "Fourgon" });
    await assign(ctx, { jobId: job, resourceType: "user", resourceId: ctx.userId, start: "2026-10-13", end: "2026-10-16" });
    await assign(ctx, { jobId: job, resourceType: "vehicle", resourceId: van, start: "2026-10-14", end: "2026-10-14" });
    const pending = await make("Cuisine");
    await db.query("UPDATE quotes SET status='sent', sent_at=now() WHERE id=$1", [pending]);

    const s = await todaySummary(ctx, new Date("2026-10-14T09:00:00Z"));
    expect(s.date).toBe("2026-10-14");
    expect(s.jobs).toHaveLength(1);
    expect(s.jobs[0]).toMatchObject({ title: "Salle de bains", vehicles: ["Fourgon"] });
    expect(s.jobs[0].team).toHaveLength(1);
    expect(s.quotes.count).toBe(1);
    expect(s.quotes.items[0].title).toBe("Cuisine");
    expect((await todaySummary(ctx, new Date("2026-10-20T09:00:00Z"))).jobs).toEqual([]);
  });
});
