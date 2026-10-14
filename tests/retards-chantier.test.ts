import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { addWorkingDays, assessDelay, delayMail } from "@/lib/delays";
import type { Ctx } from "@/lib/services/context";
import { delayBoard, notifyCustomerDelay, runDelayNotices, setDelayAutoNotice } from "@/lib/services/delays";
import { completeProfile, freshDb, makeCustomer, signUp } from "./helpers";

describe("retards : calculs", () => {
  it("compte les jours ouvrés", () => {
    expect(addWorkingDays("2026-10-16", 1)).toBe("2026-10-16");
    expect(addWorkingDays("2026-10-16", 2)).toBe("2026-10-19");
    expect(addWorkingDays("2026-10-17", 1)).toBe("2026-10-19");
  });

  it("reste dans les temps quand l'avancement suit", () => {
    const a = assessDelay({ start: "2026-10-05", end: "2026-10-16", today: "2026-10-12", progress: 0.5, remainingLabourDays: 0, crew: 1 });
    expect(a.state).toBe("a_l_heure");
    expect(a.expected).toBeCloseTo(0.5);
  });

  it("estime la fin probable et l'effet d'une personne de plus", () => {
    const a = assessDelay({ start: "2026-10-05", end: "2026-10-16", today: "2026-10-12", progress: 0.2, remainingLabourDays: 12, crew: 1 });
    expect(a.state).toBe("en_retard");
    expect(a.projectedEnd).toBe("2026-10-27");
    expect(a.lateDays).toBe(7);
    expect(a.withOneMore).toBe("2026-10-19");
  });

  it("signale une date de fin dépassée", () => {
    const a = assessDelay({ start: "2026-10-01", end: "2026-10-09", today: "2026-10-14", progress: 0.9, remainingLabourDays: 0, crew: 2 });
    expect(a.state).toBe("depasse");
    expect(a.projectedEnd >= "2026-10-14").toBe(true);
  });

  it("rédige l'e-mail au client", () => {
    const m = delayMail({ title: "Salle de bains", address: "3 rue A", plannedEnd: "2026-10-16", newEnd: "2026-10-27", orgName: "Durand", orgPhone: "" });
    expect(m.body).toContain("terminer le mardi 27 octobre, au lieu du vendredi 16 octobre");
  });
});

describe("retards : service", () => {
  let db: Database;
  let ctx: Ctx;
  let jobId: string;
  const NOW = new Date("2026-10-12T10:00:00Z");

  beforeAll(async () => {
    db = await freshDb();
    ctx = await signUp(db, "retards@exemple.fr");
    await completeProfile(ctx);
    const customerId = await makeCustomer(ctx);
    const j = await db.query<{ id: string }>(
      "INSERT INTO jobs (org_id, customer_id, title, status, start_date, end_date, site_line1, site_postal_code, site_city) VALUES ($1,$2,'Salle de bains','en_cours','2026-10-05','2026-10-16','3 rue A','69003','Lyon') RETURNING id",
      [ctx.orgId, customerId],
    );
    jobId = j[0].id;
    await db.query("INSERT INTO job_tasks (org_id, job_id, label, quantity, unit, nature, progress_bp) VALUES ($1,$2,'Pose','15','j','main_oeuvre',2000)", [
      ctx.orgId,
      jobId,
    ]);
    await db.query(
      "INSERT INTO jobs (org_id, customer_id, title, status, start_date, end_date) VALUES ($1,$2,'Futur','a_planifier','2026-11-02','2026-11-06')",
      [ctx.orgId, customerId],
    );
  });

  it("repère le chantier en retard et prévient le client une fois par date", async () => {
    const b = await delayBoard(ctx, NOW);
    expect(b.jobs).toHaveLength(1);
    expect(b.jobs[0]).toMatchObject({ state: "en_retard", projectedEnd: "2026-10-27" });
    expect(await notifyCustomerDelay(ctx, jobId, NOW)).toBe("2026-10-27");
    await expect(notifyCustomerDelay(ctx, jobId, NOW)).rejects.toThrow(/déjà/);
    expect((await delayBoard(ctx, NOW)).jobs[0].lastNotice?.newEnd).toBe("2026-10-27");
  });

  it("prévient automatiquement seulement si activé, et au plus une fois par semaine", async () => {
    await db.query("UPDATE job_tasks SET progress_bp=1000 WHERE job_id=$1", [jobId]);
    expect((await runDelayNotices(db, NOW)).sent).toBe(0);
    await setDelayAutoNotice(ctx, true);
    expect((await runDelayNotices(db, NOW)).sent).toBe(0);
    const later = new Date("2026-10-20T10:00:00Z");
    expect((await runDelayNotices(db, later)).sent).toBe(1);
    const n = await db.query<{ automatic: boolean }>("SELECT automatic FROM job_delay_notices WHERE job_id=$1 ORDER BY sent_at DESC", [jobId]);
    expect(n[0].automatic).toBe(true);
  });
});
