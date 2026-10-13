import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { deleteJobMessage, listJobMessages, postJobMessage, unreadJobMessages } from "@/lib/services/job-chat";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
let mate: Ctx;
let other: Ctx;
let jobId: string;

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "messages@exemple.fr");
  await completeProfile(ctx);
  const m = await signUp(db, "messages-ouvrier@exemple.fr", "Ouvrier");
  await db.query("INSERT INTO memberships (org_id, user_id, role, job_function) VALUES ($1,$2,'member','ouvrier')", [ctx.orgId, m.userId]);
  mate = { ...m, orgId: ctx.orgId, role: "member", jobFunction: "ouvrier" } as Ctx;
  const o = await signUp(db, "messages-autre@exemple.fr", "Autre");
  await db.query("INSERT INTO memberships (org_id, user_id, role, job_function) VALUES ($1,$2,'member','ouvrier')", [ctx.orgId, o.userId]);
  other = { ...o, orgId: ctx.orgId, role: "member", jobFunction: "ouvrier" } as Ctx;
  const qid = await createQuote(ctx, { customerId: await makeCustomer(ctx) });
  const d = await getDraft(ctx, qid);
  await saveDraft(ctx, qid, { ...d, title: "Salle de bains", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  await issueQuote(ctx, qid);
  await recordResponseManually(ctx, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  jobId = await createJobFromQuote(ctx, qid);
  await db.query(
    "INSERT INTO job_assignments (org_id, job_id, resource_type, resource_id, start_date, end_date) VALUES ($1,$2,'user',$3,'2026-10-12','2026-10-16')",
    [ctx.orgId, jobId, mate.userId],
  );
  for (const [user, endpoint] of [
    [mate.userId, "https://push.exemple.fr/ouvrier"],
    [other.userId, "https://push.exemple.fr/autre"],
    [ctx.userId, "https://push.exemple.fr/patron"],
  ]) {
    await db.query("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1,$2,'cle','secret')", [user, endpoint]);
  }
});

const pushes = async () =>
  (await db.query<{ payload: { message: { body: string } } }>("SELECT payload FROM background_jobs WHERE kind='push.send' ORDER BY created_at")).map(
    (r) => r.payload.message.body,
  );

describe("messagerie de chantier", () => {
  it("envoie, prévient l'équipe affectée et compte les non lus", async () => {
    await expect(postJobMessage(ctx, jobId, "   ")).rejects.toThrow("Écrivez un message");
    await expect(postJobMessage(ctx, jobId, "x".repeat(2001))).rejects.toThrow("trop long");
    await postJobMessage(ctx, jobId, "Livraison du carrelage demain 8 h.");
    // Seule la personne affectée est prévenue, pas l'auteur ni le reste de l'équipe.
    const sent = await pushes();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("Livraison du carrelage demain 8 h.");

    expect((await unreadJobMessages(mate)).get(jobId)).toBe(1);
    expect((await unreadJobMessages(ctx)).get(jobId)).toBeUndefined();
    const list = await listJobMessages(mate, jobId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ mine: false, body: "Livraison du carrelage demain 8 h." });
    expect((await unreadJobMessages(mate)).get(jobId)).toBeUndefined();

    const reply = await postJobMessage(mate, jobId, "Bien noté, j'ouvre le garage.");
    expect((await unreadJobMessages(ctx)).get(jobId)).toBe(1);
    expect(await pushes()).toHaveLength(2);
    expect((await listJobMessages(ctx, jobId)).map((m) => m.mine)).toEqual([true, false]);

    await expect(deleteJobMessage(other, reply)).rejects.toMatchObject({ status: 403 });
    await deleteJobMessage(mate, reply);
    expect(await listJobMessages(ctx, jobId)).toHaveLength(1);
    await expect(deleteJobMessage(ctx, reply)).rejects.toMatchObject({ status: 404 });
  });
});
