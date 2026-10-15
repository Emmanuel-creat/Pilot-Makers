import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { MIN_VERIFIED_JOBS, nextSteps, trustScore, type TrustFacts } from "@/lib/trust-score";
import type { Ctx } from "@/lib/services/context";
import { myTrustScore, publicTrust, setTrustShown, trustFacts } from "@/lib/services/trust-score";
import { updateShowcase } from "@/lib/services/showcase";
import { completeProfile, freshDb, signUp } from "./helpers";

const base: TrustFacts = {
  receivedJobs: 20,
  cleanReceptions: 20,
  reservesTotal: 0,
  reservesLifted: 0,
  jobsWithPlannedEnd: 20,
  jobsOnTime: 20,
  ratings: [5, 5],
  insured: true,
  registered: true,
};

describe("calcul de la note", () => {
  it("parfait : 100, excellente", () => {
    const t = trustScore(base);
    expect(t.score).toBe(100);
    expect(t.levelLabel).toBe("Excellente");
    expect(t.criteria.reduce((s, c) => s + c.max, 0)).toBe(100);
    expect(nextSteps(t)).toEqual([]);
  });

  it("pas de note en dessous de trois chantiers réceptionnés", () => {
    const t = trustScore({ ...base, receivedJobs: MIN_VERIFIED_JOBS - 1, cleanReceptions: 2, jobsWithPlannedEnd: 2, jobsOnTime: 2 });
    expect(t.score).toBeNull();
    expect(t.levelLabel).toBe("En construction");
  });

  it("réserves, retards et avis moyens font baisser la note, et les conseils visent le plus gros écart", () => {
    const t = trustScore({
      ...base,
      receivedJobs: 10,
      cleanReceptions: 5,
      reservesTotal: 8,
      reservesLifted: 4,
      jobsWithPlannedEnd: 10,
      jobsOnTime: 5,
      ratings: [3],
    });
    // 12.5 -> 13 + 10 + 5 + 10 + 10 + 5
    expect(t.score).toBe(53);
    expect(t.levelLabel).toBe("Bonne");
    expect(nextSteps(t)).toHaveLength(3);
    expect(nextSteps(t)[0]).toMatch(/procès-verbal/);
  });

  it("sans avis ni date prévue, ces critères ne rapportent rien plutôt que d'être supposés", () => {
    const t = trustScore({ ...base, receivedJobs: 3, cleanReceptions: 3, jobsWithPlannedEnd: 0, jobsOnTime: 0, ratings: [], insured: false });
    expect(t.criteria.find((c) => c.key === "avis")!.points).toBe(0);
    expect(t.criteria.find((c) => c.key === "delais")!.points).toBe(0);
    expect(t.criteria.find((c) => c.key === "legal")!.points).toBe(2);
  });
});

describe("faits vérifiés", () => {
  let db: Database;
  let ctx: Ctx;

  async function job(endDate: string, reception: { decision: string; date: string } | null, rating: number | null = null, reserves = 0, lifted = 0) {
    const [j] = await db.query<{ id: string }>("INSERT INTO jobs (org_id, title, status, end_date) VALUES ($1,'Chantier','receptionne',$2) RETURNING id", [
      ctx.orgId,
      endDate,
    ]);
    if (reception) {
      await db.query("INSERT INTO job_receptions (org_id, job_id, decision, reception_date, snapshot, pdf, pdf_sha256) VALUES ($1,$2,$3,$4,'{}',$5,'x')", [
        ctx.orgId,
        j.id,
        reception.decision,
        reception.date,
        Buffer.from("pdf"),
      ]);
    }
    for (let i = 0; i < reserves; i++) {
      await db.query("INSERT INTO job_reserves (org_id, job_id, label, lifted_at) VALUES ($1,$2,'Joint',$3)", [
        ctx.orgId,
        j.id,
        i < lifted ? new Date() : null,
      ]);
    }
    if (rating) {
      await db.query("INSERT INTO customer_reviews (org_id, job_id, token_hash, rating, submitted_at) VALUES ($1,$2,$3,$4,now())", [
        ctx.orgId,
        j.id,
        `t-${j.id}`,
        rating,
      ]);
    }
  }

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "confiance@exemple.fr");
    await completeProfile(ctx);
  });

  it("ne compte que les chantiers réceptionnés, et les avis de ces chantiers", async () => {
    await job("2026-09-01", { decision: "sans_reserve", date: "2026-09-05" }, 5);
    await job("2026-09-01", { decision: "avec_reserves", date: "2026-09-20" }, 4, 2, 1);
    await job("2026-09-01", { decision: "refus", date: "2026-09-02" }, null, 3);
    await job("2026-09-01", null, 1);
    const f = await trustFacts(db, ctx.orgId);
    expect(f).toMatchObject({ receivedJobs: 2, cleanReceptions: 1, reservesTotal: 2, reservesLifted: 1, jobsWithPlannedEnd: 2, jobsOnTime: 1 });
    expect(f.ratings.sort()).toEqual([4, 5]);
    expect((await myTrustScore(ctx)).score).toBeNull();
  });

  it("affichage sur la vitrine au choix, et seulement une fois la note calculable", async () => {
    await expect(setTrustShown(ctx, true)).rejects.toThrow(/vitrine/);
    await updateShowcase(ctx, { enabled: false, slug: "confiance-test", intro: "", area: "", show_phone: "on", show_email: "on" });
    await setTrustShown(ctx, true);
    expect(await publicTrust(db, ctx.orgId, true)).toBeNull();
    await job("2026-09-10", { decision: "sans_reserve", date: "2026-09-10" }, 5);
    const t = await myTrustScore(ctx);
    expect(t.shown).toBe(true);
    expect(t.score).not.toBeNull();
    expect((await publicTrust(db, ctx.orgId, true))?.score).toBe(t.score);
    expect(await publicTrust(db, ctx.orgId, false)).toBeNull();
    await expect(setTrustShown({ ...ctx, role: "member", jobFunction: "ouvrier" } as Ctx, false)).rejects.toThrow();
  });
});
