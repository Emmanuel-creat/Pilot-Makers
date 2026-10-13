import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import type { Ctx } from "@/lib/services/context";
import { createJobFromQuote } from "@/lib/services/jobs";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { hideReview, jobReview, listReviews, publicReviews, replyReview, requestReview, reviewInvitation, submitReview } from "@/lib/services/reviews";
import { publicShowcase, updateShowcase } from "@/lib/services/showcase";
import { averageRating, displayName } from "@/lib/reviews";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let ctx: Ctx;
const meta = { ip: "203.0.113.9" };

async function job(customer: Record<string, string>) {
  const qid = await createQuote(ctx, { customerId: await makeCustomer(ctx, customer) });
  const d = await getDraft(ctx, qid);
  await saveDraft(ctx, qid, { ...d, title: "Salle de bains", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  await issueQuote(ctx, qid);
  await recordResponseManually(ctx, qid, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  return createJobFromQuote(ctx, qid);
}
const tokenOf = (url: string) => url.split("/avis/")[1];

beforeAll(async () => {
  db = await freshDb();
  ctx = await signUp(db, "avis@exemple.fr");
  await completeProfile(ctx);
});

describe("avis : règles", () => {
  it("affiche prénom et initiale, ou le nom de la société", () => {
    expect(displayName({ type: "particulier", first_name: "Claire", last_name: "dubois" })).toBe("Claire D.");
    expect(displayName({ type: "particulier", first_name: "", last_name: "Martin" })).toBe("M.");
    expect(displayName({ type: "entreprise", company_name: "Bâti Général SAS" })).toBe("Bâti Général SAS");
    expect(displayName({})).toBe("Client");
    expect(averageRating([5, 4, 4])).toEqual({ average: 4.3, count: 3 });
    expect(averageRating([])).toEqual({ average: null, count: 0 });
  });
});

describe("avis clients", () => {
  it("invite, recueille, publie avec accord et ne masque que pour un motif admis", async () => {
    const j1 = await job({ type: "particulier", first_name: "Claire", last_name: "Dubois", email: "claire@exemple.fr" });
    const first = await requestReview(ctx, j1, { send: true });
    expect(first.emailed).toBe(true);
    const mail = await db.query<{ to_address: string; body: string }>("SELECT to_address, body FROM emails WHERE kind='review_request'");
    expect(mail[0].to_address).toBe("claire@exemple.fr");
    expect(mail[0].body).toContain(first.url);
    // Une nouvelle invitation remplace le lien précédent.
    const again = await requestReview(ctx, j1);
    expect(await reviewInvitation(db, tokenOf(first.url))).toBeNull();
    const token = tokenOf(again.url);
    expect((await reviewInvitation(db, token))?.review.authorName).toBe("Claire D.");

    await expect(submitReview(db, token, { rating: 7 }, meta)).rejects.toThrow("note de 1 à 5");
    await submitReview(db, token, { rating: 5, comment: "Chantier propre, délais tenus.", publish: true }, meta);
    await expect(submitReview(db, token, { rating: 1 }, meta)).rejects.toMatchObject({ status: 409 });
    await expect(requestReview(ctx, j1)).rejects.toMatchObject({ status: 409 });
    expect((await jobReview(ctx, j1))?.rating).toBe(5);

    const j2 = await job({ type: "particulier", first_name: "Marc", last_name: "Petit", email: "" });
    const r2 = await requestReview(ctx, j2, { send: true });
    expect(r2.emailed).toBe(false);
    await submitReview(db, tokenOf(r2.url), { rating: 2, comment: "Retard.", publish: false }, meta);

    let pub = await publicReviews(db, ctx.orgId);
    expect(pub).toMatchObject({ count: 1, average: 5 });
    expect(pub.reviews[0]).toMatchObject({ authorName: "Claire D.", comment: "Chantier propre, délais tenus." });

    const id = (await listReviews(ctx)).find((r) => r.jobId === j1)!.id;
    await expect(hideReview(ctx, id, "note_trop_basse")).rejects.toThrow("Motif non admis");
    await hideReview(ctx, id, "hors_sujet");
    expect((await publicReviews(db, ctx.orgId)).count).toBe(0);
    await hideReview(ctx, id, "");
    await replyReview(ctx, id, "Merci Claire !");
    pub = await publicReviews(db, ctx.orgId);
    expect(pub.reviews[0].reply).toBe("Merci Claire !");

    await updateShowcase(ctx, { enabled: true, slug: "avis-lyon", intro: "", area: "", show_phone: "", show_email: "" });
    expect((await publicShowcase(db, "avis-lyon"))?.reviews.count).toBe(1);
    expect(await reviewInvitation(db, "court")).toBeNull();
  });
});
