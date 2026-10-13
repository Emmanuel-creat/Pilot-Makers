import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/db";
import { buildContext } from "@/lib/services/accounts";
import { can, type Ctx } from "@/lib/services/context";
import { createDepositInvoice } from "@/lib/services/invoices";
import { addPurchase, jobCosts } from "@/lib/services/job-costs";
import { createJobFromQuote } from "@/lib/services/jobs";
import { updateOrganization } from "@/lib/services/organization";
import { createQuote, getDraft, issueQuote, recordResponseManually, saveDraft } from "@/lib/services/quotes";
import { acceptInvite, inviteMember, listMembers, setMemberFunction } from "@/lib/services/team";
import { reviewEntries } from "@/lib/services/timesheets";
import { completeProfile, freshDb, line, makeCustomer, signUp } from "./helpers";

let db: Database;
let boss: Ctx;
let quoteId: string;
let jobId: string;
const META = { ip: "127.0.0.1", userAgent: "test" };

async function join(email: string, jobFunction: string) {
  const { token } = await inviteMember(boss, { email, jobFunction });
  const u = await signUp(db, email, "Perso");
  await acceptInvite(u, token);
  return (await buildContext(db, u.userId, boss.orgId, null, META))!;
}

beforeAll(async () => {
  db = await freshDb();
  const owner = await signUp(db, "gerant@exemple.fr");
  // Assez de places dans l'offre pour toute l'équipe de l'essai.
  boss = { ...owner, entitlements: { ...owner.entitlements, plan: { ...owner.entitlements.plan, maxUsers: 10 } } };
  await completeProfile(boss);
  quoteId = await createQuote(boss, { customerId: await makeCustomer(boss) });
  const d = await getDraft(boss, quoteId);
  await saveDraft(boss, quoteId, { ...d, title: "Façade", sections: [{ ...d.sections[0], lines: [line()] }] }, d.draftRevision);
  await issueQuote(boss, quoteId);
  await recordResponseManually(boss, quoteId, { decision: "accept", version: 1, proof: "Bon pour accord signé" });
  jobId = await createJobFromQuote(boss, quoteId);
});

describe("droits par fonction", () => {
  it("matrice des droits", () => {
    expect(can({ role: "owner", jobFunction: null }, "settings")).toBe(true);
    expect(can({ role: "admin", jobFunction: null }, "costs")).toBe(true);
    expect(can({ role: "member", jobFunction: null }, "costs")).toBe(false);
    // Comportement historique : un membre sans fonction facture.
    expect(can({ role: "member", jobFunction: null }, "billing")).toBe(true);
    expect(can({ role: "admin", jobFunction: "conducteur" }, "costs")).toBe(true);
    expect(can({ role: "admin", jobFunction: "conducteur" }, "billing")).toBe(false);
    expect(can({ role: "admin", jobFunction: "secretariat" }, "billing")).toBe(true);
    expect(can({ role: "admin", jobFunction: "secretariat" }, "costs")).toBe(false);
    expect(can({ role: "member", jobFunction: "ouvrier" }, "billing")).toBe(false);
    expect(can({ role: "admin", jobFunction: "gerant" }, "settings")).toBe(true);
  });

  it("conducteur de travaux : coûts et équipe, ni factures ni réglages", async () => {
    const c = await join("conducteur@exemple.fr", "conducteur");
    expect(c).toMatchObject({ role: "admin", jobFunction: "conducteur" });
    await jobCosts(c, jobId);
    await addPurchase(c, jobId, { date: "2026-10-12", label: "Échafaudage", amount: "120" });
    await expect(reviewEntries(c, [], "valide")).rejects.toMatchObject({ status: 400 });
    await expect(createDepositInvoice(c, quoteId, { percent: "30" })).rejects.toMatchObject({ status: 403 });
    await expect(updateOrganization(c, { trade_name: "Autre nom" })).rejects.toMatchObject({ status: 403 });
    await expect(inviteMember(c, { email: "x@exemple.fr", jobFunction: "ouvrier" })).rejects.toMatchObject({ status: 403 });
  });

  it("secrétariat : facturation, sans coûts ni marges", async () => {
    const s = await join("secretariat@exemple.fr", "secretariat");
    expect(s.role).toBe("admin");
    await expect(jobCosts(s, jobId)).rejects.toMatchObject({ status: 403 });
    await expect(addPurchase(s, jobId, { date: "2026-10-12", label: "Sable", amount: "10" })).rejects.toMatchObject({ status: 403 });
    const inv = await createDepositInvoice(s, quoteId, { percent: "30" });
    expect(inv.id).toBeTruthy();
  });

  it("ouvrier : ses chantiers, sans facture ni validation", async () => {
    const o = await join("ouvrier@exemple.fr", "ouvrier");
    expect(o.role).toBe("member");
    await expect(createDepositInvoice(o, quoteId, { percent: "10" })).rejects.toMatchObject({ status: 403 });
    await expect(reviewEntries(o, [], "valide")).rejects.toMatchObject({ status: 403 });
  });

  it("changer la fonction change le rôle ; le titulaire reste gérant", async () => {
    const members = await listMembers(boss);
    const o = members.find((m) => m.email === "ouvrier@exemple.fr")!;
    await setMemberFunction(boss, o.user_id, "conducteur");
    const after = (await buildContext(db, o.user_id, boss.orgId, null, META))!;
    expect(after).toMatchObject({ role: "admin", jobFunction: "conducteur" });
    await expect(setMemberFunction(boss, o.user_id, "chef")).rejects.toMatchObject({ status: 400 });
    await expect(setMemberFunction(boss, boss.userId, "ouvrier")).rejects.toMatchObject({ status: 400 });
    const c = members.find((m) => m.email === "conducteur@exemple.fr")!;
    const conducteur = (await buildContext(db, c.user_id, boss.orgId, null, META))!;
    await expect(setMemberFunction(conducteur, o.user_id, "gerant")).rejects.toMatchObject({ status: 403 });
    await setMemberFunction(boss, o.user_id, "");
    expect((await buildContext(db, o.user_id, boss.orgId, null, META))!.jobFunction).toBeNull();
  });
});
