import { beforeAll, describe, expect, it } from "vitest";
import { buildAdvice, type AdviceSignals } from "@/lib/advice";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { dismissAdvice, proactiveAdvice } from "@/lib/services/advice";
import { createQuote, getDraft, issueQuote, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

const empty: AdviceSignals = {
  overdue: { count: 0, cents: 0 },
  staleQuotes: { count: 0, cents: 0 },
  expiringQuotes: 0,
  unbilled: { count: 0, cents: 0 },
  unreceivedJobs: 0,
  overloaded: null,
  weakIndicators: [],
};

describe("construction des conseils", () => {
  it("ne dit rien sans signal", () => {
    expect(buildAdvice(empty)).toEqual([]);
  });

  it("classe par urgence puis par enjeu", () => {
    const list = buildAdvice({
      ...empty,
      staleQuotes: { count: 3, cents: 900_000 },
      overdue: { count: 1, cents: 120_000 },
      unbilled: { count: 2, cents: 500_000 },
      overloaded: 1,
    });
    expect(list.map((a) => a.key)).toEqual(["devis-non-factures", "factures-retard", "devis-sans-reponse", "surcharge"]);
    expect(list[1].title).toBe("Relancer 1 facture en retard");
  });

  it("garde seulement les indicateurs faibles et évite les doublons avec les retards", () => {
    const ind = (key: string, points: number) => ({ key, label: key, value: "x", points, max: 10, advice: "faire mieux" });
    const list = buildAdvice({ ...empty, overdue: { count: 1, cents: 1 }, weakIndicators: [ind("marge", 2), ind("retards", 0), ind("carnet", 8)] });
    expect(list.map((a) => a.key)).toEqual(["factures-retard", "sante-marge"]);
  });
});

describe("conseils de l'entreprise", () => {
  let db: Database;
  let ctx: Ctx;

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "conseils@exemple.fr");
    await completeProfile(ctx);
  });

  async function quote() {
    const qid = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
    const d = await getDraft(ctx, qid);
    await saveDraft(ctx, qid, { ...d, title: "Peinture", sections: [{ ...d.sections[0], lines: [line({ unitPriceCents: 100_000 })] }] }, d.draftRevision);
    await issueQuote(ctx, qid);
    return qid;
  }

  it("repère les devis sans réponse et les devis acceptés non facturés", async () => {
    const stale = await quote();
    await db.query("UPDATE quotes SET status='sent', sent_at = now() - interval '15 days' WHERE id=$1", [stale]);
    const won = await quote();
    await db.query("UPDATE quotes SET status='accepted', responded_at = now() - interval '40 days' WHERE id=$1", [won]);
    const list = await proactiveAdvice(ctx);
    const keys = list.map((a) => a.key);
    expect(keys).toContain("devis-sans-reponse");
    expect(keys.indexOf("devis-non-factures")).toBe(0);
    expect(list[0].stakeCents).toBeGreaterThan(0);
  });

  it("masque un conseil pour 30 jours", async () => {
    await dismissAdvice(ctx, { key: "devis-sans-reponse" });
    expect((await proactiveAdvice(ctx)).map((a) => a.key)).not.toContain("devis-sans-reponse");
    const later = new Date(Date.now() + 40 * 86_400_000);
    expect((await proactiveAdvice(ctx, later)).map((a) => a.key)).toContain("devis-sans-reponse");
    await expect(dismissAdvice(ctx, { key: "Pas bon !" })).rejects.toThrow();
  });
});
