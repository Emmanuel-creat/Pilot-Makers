import { afterEach, describe, expect, it, vi } from "vitest";
import { sendMail, setMailProviderForTests, type MailProvider } from "@/lib/services/mail";
import { postmarkProvider } from "@/lib/services/mail-providers";
import { JOB_HANDLERS } from "@/lib/services/job-handlers";
import { PermanentJobError, enqueueJob, jobStats, purgeJobs, retryDelayMs, runJobs } from "@/lib/services/task-queue";
import { freshDb } from "./helpers";

afterEach(() => {
  setMailProviderForTests(null);
  vi.unstubAllGlobals();
});

const later = (min: number) => new Date(Date.now() + min * 60_000);

describe("file de tâches", () => {
  it("espace les nouveaux essais puis abandonne la tâche", async () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([60_000, 120_000, 240_000, 480_000]);
    expect(retryDelayMs(30)).toBe(6 * 3600_000);
    const db = await freshDb();
    let calls = 0;
    const handlers = {
      boom: async () => {
        calls++;
        throw new Error("indisponible");
      },
    };
    await enqueueJob(db, "boom", {}, { maxAttempts: 2 });
    expect(await runJobs(db, handlers)).toEqual({ done: 0, retried: 1, dead: 0 });
    expect(await runJobs(db, handlers)).toEqual({ done: 0, retried: 0, dead: 0 });
    expect(await runJobs(db, handlers, { now: later(2) })).toEqual({ done: 0, retried: 0, dead: 1 });
    expect(calls).toBe(2);
    expect((await jobStats(db)).counts.dead).toBe(1);
  });

  it("n'enregistre pas deux fois la même tâche et abandonne sans réessayer une erreur définitive", async () => {
    const db = await freshDb();
    expect(await enqueueJob(db, "x", {}, { dedupeKey: "k" })).toBeTruthy();
    expect(await enqueueJob(db, "x", {}, { dedupeKey: "k" })).toBeNull();
    const r = await runJobs(db, {
      x: async () => {
        throw new PermanentJobError("non");
      },
    });
    expect(r.dead).toBe(1);
    await enqueueJob(db, "inconnue", {});
    expect((await runJobs(db, {})).dead).toBe(1);
  });

  it("reprend une tâche interrompue à l'expiration de son verrou et purge les anciennes", async () => {
    const db = await freshDb();
    await enqueueJob(db, "ok", {});
    await db.query("UPDATE background_jobs SET status='running', locked_until=now() - interval '1 minute'");
    const seen: number[] = [];
    expect(
      (
        await runJobs(db, {
          ok: async (_db, job) => {
            seen.push(job.attempts);
          },
        })
      ).done,
    ).toBe(1);
    expect(seen).toEqual([1]);
    expect(await purgeJobs(db, new Date(Date.now() + 31 * 86_400_000))).toBe(1);
  });

  it("renvoie plus tard un e-mail refusé pour une raison passagère", async () => {
    const db = await freshDb();
    let fail = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        fail
          ? new Response(JSON.stringify({ Message: "Service indisponible" }), { status: 503 })
          : new Response(JSON.stringify({ ErrorCode: 0, MessageID: "pm-7" }), { status: 200 }),
      ),
    );
    setMailProviderForTests(postmarkProvider("cle", "devis@exemple.fr"));
    const r = await sendMail(db, { kind: "test", to: "client@exemple.fr", subject: "s", body: "b" });
    expect(r.status).toBe("failed");
    expect((await jobStats(db)).counts.pending).toBe(1);
    fail = false;
    expect(await runJobs(db, JOB_HANDLERS, { now: later(2) })).toEqual({ done: 1, retried: 0, dead: 0 });
    const row = (await db.query<{ status: string; attempts: number }>("SELECT status, attempts FROM emails WHERE id=$1", [r.id]))[0];
    expect(row).toMatchObject({ status: "sent", attempts: 2 });
  });

  it("ne réessaie pas un refus définitif", async () => {
    const db = await freshDb();
    const refuse: MailProvider = { name: "test", deliver: async () => ({ status: "failed", error: "Adresse refusée" }) };
    setMailProviderForTests(refuse);
    await sendMail(db, { kind: "test", to: "client@exemple.fr", subject: "s", body: "b" });
    expect((await jobStats(db)).counts.pending).toBe(0);
  });
});
